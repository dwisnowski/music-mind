export type PhraseNoteHandler = (midi: number, on: boolean) => void;

export interface PhrasePlayOptions {
  /** Quarter-note BPM. */
  bpm: number;
  /** Delay before first note, in seconds. */
  leadInSec?: number;
  /** Duration of each note in beats (quarters). Default 1. */
  noteBeats?: number;
  onNote?: PhraseNoteHandler;
  onEnded?: () => void;
}

/**
 * Schedules a MIDI pitch sequence via Web Audio oscillators.
 * Independent of LoadedScore / ScorePlayer.
 */
export class PhrasePlayer {
  private ctx: AudioContext | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private endTimer: number | null = null;
  private noteTimers: number[] = [];
  private playing = false;
  private onNote: PhraseNoteHandler | null = null;
  private onEnded: (() => void) | null = null;

  isPlaying() {
    return this.playing;
  }

  async play(midis: number[], options: PhrasePlayOptions): Promise<void> {
    this.stop({ emitEnded: false });

    const bpm = Math.min(200, Math.max(40, options.bpm));
    const noteBeats = options.noteBeats ?? 1;
    const leadInSec = options.leadInSec ?? 0;
    this.onNote = options.onNote ?? null;
    this.onEnded = options.onEnded ?? null;

    if (midis.length === 0) {
      this.onEnded?.();
      return;
    }

    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);

    const secPerQuarter = 60 / bpm;
    const noteDur = Math.max(0.08, noteBeats * secPerQuarter * 0.85);
    const startAt = ctx.currentTime + Math.max(0, leadInSec);
    let lastEnd = startAt;

    for (let i = 0; i < midis.length; i++) {
      const midi = midis[i]!;
      const when = startAt + i * noteBeats * secPerQuarter;
      this.scheduleNote(ctx, master, midi, when, noteDur);
      lastEnd = Math.max(lastEnd, when + noteDur);
    }

    this.playing = true;
    const remainingMs = Math.max(0, (lastEnd - ctx.currentTime) * 1000) + 60;
    this.endTimer = window.setTimeout(() => {
      this.playing = false;
      this.onEnded?.();
      void this.ctx?.close();
      this.ctx = null;
      this.nodes = [];
    }, remainingMs);
  }

  stop(options: { emitEnded?: boolean } = {}): void {
    const emitEnded = options.emitEnded ?? true;
    if (this.endTimer != null) {
      window.clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const t of this.noteTimers) window.clearTimeout(t);
    this.noteTimers = [];

    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* already stopped */
      }
      try {
        node.disconnect();
      } catch {
        /* ignore */
      }
    }
    this.nodes = [];

    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }

    const wasPlaying = this.playing;
    const ended = this.onEnded;
    this.playing = false;
    this.onNote = null;
    this.onEnded = null;
    if (emitEnded && wasPlaying) ended?.();
  }

  private scheduleNote(
    ctx: AudioContext,
    master: GainNode,
    midi: number,
    when: number,
    durationSec: number,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = 440 * 2 ** ((midi - 69) / 12);

    const attack = 0.012;
    const release = Math.min(0.18, durationSec * 0.35);
    const peak = 0.9;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + attack);
    gain.gain.exponentialRampToValueAtTime(
      peak * 0.55,
      when + Math.max(attack, durationSec * 0.4),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, when + durationSec + release);

    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + durationSec + release + 0.02);
    this.nodes.push(osc);

    const onDelay = Math.max(0, (when - ctx.currentTime) * 1000);
    const offDelay = Math.max(0, (when + durationSec - ctx.currentTime) * 1000);
    this.noteTimers.push(
      window.setTimeout(() => this.onNote?.(midi, true), onDelay),
      window.setTimeout(() => this.onNote?.(midi, false), offDelay),
    );
  }
}
