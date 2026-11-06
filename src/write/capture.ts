import { quantizeCapture, collapseChords, type RawCaptureEvent, type QuantizedNote } from "./quantize";

export type CaptureState = "idle" | "countIn" | "recording";

export interface CaptureSessionOptions {
  bpm: number;
  gridQuarters: number;
  /** Count-in beats before recording (default 4). */
  countInBeats?: number;
  onBeat?: (beatIndex: number, isCountIn: boolean) => void;
  onState?: (state: CaptureState) => void;
}

/**
 * Metronome-backed capture of MIDI/on-screen note on/off events.
 */
export class CaptureSession {
  private state: CaptureState = "idle";
  private events: RawCaptureEvent[] = [];
  private startPerf = 0;
  private audio: AudioContext | null = null;
  private timers: number[] = [];
  private opts: CaptureSessionOptions | null = null;

  getStatus(): CaptureState {
    return this.state;
  }

  getEvents(): RawCaptureEvent[] {
    return this.events;
  }

  async start(opts: CaptureSessionOptions): Promise<void> {
    this.stopTimers();
    this.events = [];
    this.opts = opts;
    const bpm = Math.max(40, Math.min(240, opts.bpm));
    const beatSec = 60 / bpm;
    const countIn = opts.countInBeats ?? 4;

    this.audio = new AudioContext();
    await this.audio.resume();

    this.setState("countIn");
    const ctx = this.audio;
    const t0 = ctx.currentTime + 0.05;

    for (let i = 0; i < countIn; i++) {
      this.scheduleClick(ctx, t0 + i * beatSec, true);
      const delay = Math.max(0, (t0 + i * beatSec - ctx.currentTime) * 1000);
      this.timers.push(window.setTimeout(() => opts.onBeat?.(i, true), delay));
    }

    const recordAt = t0 + countIn * beatSec;
    const delayMs = Math.max(0, (recordAt - ctx.currentTime) * 1000);
    this.timers.push(
      window.setTimeout(() => {
        this.startPerf = performance.now();
        this.setState("recording");
        opts.onBeat?.(0, false);
      }, delayMs),
    );

    const maxBeats = Math.ceil((8 * 60) / beatSec);
    for (let i = 0; i < maxBeats; i++) {
      const at = recordAt + i * beatSec;
      this.scheduleClick(ctx, at, false);
      this.timers.push(
        window.setTimeout(() => {
          if (this.state === "recording") opts.onBeat?.(i, false);
        }, Math.max(0, (at - ctx.currentTime) * 1000)),
      );
    }
  }

  noteOn(midi: number, timestamp?: number) {
    if (this.state !== "recording") return;
    this.events.push({ midi, type: "on", t: this.elapsedSec(timestamp) });
  }

  noteOff(midi: number, timestamp?: number) {
    if (this.state !== "recording") return;
    this.events.push({ midi, type: "off", t: this.elapsedSec(timestamp) });
  }

  stop(): QuantizedNote[] {
    const opts = this.opts;
    this.stopTimers();
    this.setState("idle");
    void this.audio?.close();
    this.audio = null;
    if (!opts) return [];
    return quantizeCapture(this.events, {
      bpm: opts.bpm,
      gridQuarters: opts.gridQuarters,
    });
  }

  stopCollapsed() {
    return collapseChords(this.stop());
  }

  private elapsedSec(timestamp?: number): number {
    if (timestamp != null && timestamp > 1000) {
      return Math.max(0, (timestamp - this.startPerf) / 1000);
    }
    return Math.max(0, (performance.now() - this.startPerf) / 1000);
  }

  private setState(s: CaptureState) {
    this.state = s;
    this.opts?.onState?.(s);
  }

  private stopTimers() {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }

  private scheduleClick(ctx: AudioContext, when: number, accent: boolean) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = accent ? 1200 : 900;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.2 : 0.12, when + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(when);
    osc.stop(when + 0.08);
  }
}
