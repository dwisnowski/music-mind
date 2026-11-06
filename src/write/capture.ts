import {
  quantizeCapture,
  collapseChords,
  quantizePedals,
  normalizeCaptureEvents,
  type RawCaptureEvent,
  type QuantizedNote,
  type QuantizedPedal,
} from "./quantize";
import { DOCK_DEFAULT_VELOCITY } from "./rollingBuffer";

export type CaptureState = "idle" | "countIn" | "recording";

export interface CaptureSessionOptions {
  bpm: number;
  gridQuarters: number;
  /** Count-in beats before recording (default 4). 0 = start immediately. */
  countInBeats?: number;
  /** When false, skip metronome clicks (tray takes). Default true. */
  metronome?: boolean;
  onBeat?: (beatIndex: number, isCountIn: boolean) => void;
  onState?: (state: CaptureState) => void;
}

export interface CaptureStopResult {
  notes: QuantizedNote[];
  pedals: QuantizedPedal[];
  events: RawCaptureEvent[];
}

/**
 * Metronome-backed (or free) capture of MIDI/on-screen note + pedal events.
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
    const useMetronome = opts.metronome !== false;

    if (useMetronome || countIn > 0) {
      this.audio = new AudioContext();
      await this.audio.resume();
    }

    if (countIn <= 0) {
      this.startPerf = performance.now();
      this.setState("recording");
      opts.onBeat?.(0, false);
      if (useMetronome && this.audio) {
        this.scheduleMetronomeBeats(this.audio, this.audio.currentTime + 0.05, beatSec, bpm, opts);
      }
      return;
    }

    this.setState("countIn");
    const ctx = this.audio!;
    const t0 = ctx.currentTime + 0.05;

    for (let i = 0; i < countIn; i++) {
      if (useMetronome) this.scheduleClick(ctx, t0 + i * beatSec, true);
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

    if (useMetronome) {
      this.scheduleMetronomeBeats(ctx, recordAt, beatSec, bpm, opts);
    }
  }

  noteOn(midi: number, timestamp?: number, velocity?: number) {
    if (this.state !== "recording") return;
    this.events.push({
      kind: "note",
      midi,
      type: "on",
      t: this.elapsedSec(timestamp),
      velocity: velocity ?? DOCK_DEFAULT_VELOCITY,
    });
  }

  noteOff(midi: number, timestamp?: number, velocity?: number) {
    if (this.state !== "recording") return;
    this.events.push({
      kind: "note",
      midi,
      type: "off",
      t: this.elapsedSec(timestamp),
      velocity,
    });
  }

  controlChange(controller: number, value: number, timestamp?: number) {
    if (this.state !== "recording") return;
    this.events.push({
      kind: "cc",
      controller,
      value,
      t: this.elapsedSec(timestamp),
    });
  }

  /** Stop without quantizing — return raw events (for tray takes). */
  stopRaw(): RawCaptureEvent[] {
    this.stopTimers();
    this.setState("idle");
    void this.audio?.close();
    this.audio = null;
    const events = normalizeCaptureEvents(this.events);
    this.events = [];
    this.opts = null;
    return events;
  }

  stop(): CaptureStopResult {
    const opts = this.opts;
    const events = normalizeCaptureEvents(this.events);
    this.stopTimers();
    this.setState("idle");
    void this.audio?.close();
    this.audio = null;
    this.events = [];
    this.opts = null;
    if (!opts) return { notes: [], pedals: [], events };
    return {
      notes: quantizeCapture(events, {
        bpm: opts.bpm,
        gridQuarters: opts.gridQuarters,
      }),
      pedals: quantizePedals(events, {
        bpm: opts.bpm,
        gridQuarters: opts.gridQuarters,
      }),
      events,
    };
  }

  stopCollapsed() {
    const result = this.stop();
    return {
      ...result,
      collapsed: collapseChords(result.notes),
    };
  }

  private scheduleMetronomeBeats(
    ctx: AudioContext,
    recordAt: number,
    beatSec: number,
    bpm: number,
    opts: CaptureSessionOptions,
  ) {
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
    void bpm;
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
