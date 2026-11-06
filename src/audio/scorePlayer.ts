import type { Hand, LoadedScore } from "../score/types";
import { filterEventByHand } from "../score/types";

export type ListenNoteHandler = (midi: number, on: boolean, staffIndex: number) => void;
export type ListenEventHandler = (eventIndex: number) => void;

export interface ScorePlayerOptions {
  /** Quarter-note BPM. Default 80. */
  bpm?: number;
  hand?: Hand;
  /** Inclusive start into score.events (remaining from this index). */
  startEventIndex?: number;
  /**
   * When set, play at most this many events from `startEventIndex`
   * (exclusive end = start + maxEvents).
   */
  maxEvents?: number;
  /**
   * When true, keep AudioContext timing and onNote/onEvent callbacks
   * but silence oscillators (e.g. player-piano MIDI Out is the sound).
   */
  muteAudio?: boolean;
  onNote?: ListenNoteHandler;
  /** Fired when a score event (chord/onset) begins, for score cursor follow. */
  onEvent?: ListenEventHandler;
  onEnded?: () => void;
}

/**
 * Plays a LoadedScore timeline via Web Audio.
 * Independent of practice cursor / FeedbackEngine position.
 */
export class ScorePlayer {
  private ctx: AudioContext | null = null;
  private nodes: AudioScheduledSourceNode[] = [];
  private endTimer: number | null = null;
  private noteOffTimers: number[] = [];
  private playing = false;
  private onNote: ListenNoteHandler | null = null;
  private onEvent: ListenEventHandler | null = null;
  private onEnded: (() => void) | null = null;

  isPlaying() {
    return this.playing;
  }

  async play(score: LoadedScore, options: ScorePlayerOptions = {}) {
    this.stop({ emitEnded: false });

    const bpm = options.bpm ?? 80;
    const hand = options.hand ?? "both";
    const startEventIndex = Math.max(0, options.startEventIndex ?? 0);
    const endEventIndex =
      options.maxEvents != null
        ? startEventIndex + Math.max(0, Math.trunc(options.maxEvents))
        : Number.POSITIVE_INFINITY;
    this.onNote = options.onNote ?? null;
    this.onEvent = options.onEvent ?? null;
    this.onEnded = options.onEnded ?? null;

    const ctx = new AudioContext();
    this.ctx = ctx;
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const master = ctx.createGain();
    master.gain.value = options.muteAudio ? 0 : 0.22;
    master.connect(ctx.destination);

    const secPerQuarter = 60 / bpm;
    const startAt = ctx.currentTime + 0.06;
    const t0 = score.events[startEventIndex]?.timestamp ?? 0;
    let lastEnd = startAt;
    let scheduledAny = false;

    // Place Listen cursor immediately at the start event.
    this.onEvent?.(Math.min(startEventIndex, Math.max(0, score.events.length - 1)));

    for (const event of score.events) {
      if (event.index < startEventIndex) continue;
      if (event.index >= endEventIndex) break;

      const filtered = filterEventByHand(event, hand);
      if (filtered.notes.length === 0) continue;

      const when = startAt + (event.timestamp - t0) * secPerQuarter;
      const eventDelay = Math.max(0, (when - ctx.currentTime) * 1000);
      const eventIndex = event.index;
      this.noteOffTimers.push(
        window.setTimeout(() => this.onEvent?.(eventIndex), eventDelay),
      );

      for (const note of filtered.notes) {
        const dur = Math.max(0.08, note.duration * secPerQuarter);
        this.scheduleNote(ctx, master, note.midi, note.staffIndex, when, dur);
        lastEnd = Math.max(lastEnd, when + dur);
        scheduledAny = true;
      }
    }

    this.playing = true;
    if (!scheduledAny) {
      this.playing = false;
      this.onEnded?.();
      void this.ctx.close();
      this.ctx = null;
      return;
    }

    const remainingMs = Math.max(0, (lastEnd - ctx.currentTime) * 1000) + 80;
    this.endTimer = window.setTimeout(() => {
      this.playing = false;
      this.onEnded?.();
      void this.ctx?.close();
      this.ctx = null;
      this.nodes = [];
    }, remainingMs);
  }

  stop(options: { emitEnded?: boolean } = {}) {
    const emitEnded = options.emitEnded ?? true;
    if (this.endTimer != null) {
      window.clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const t of this.noteOffTimers) window.clearTimeout(t);
    this.noteOffTimers = [];

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
    if (emitEnded && wasPlaying) ended?.();
  }

  private scheduleNote(
    ctx: AudioContext,
    master: GainNode,
    midi: number,
    staffIndex: number,
    when: number,
    durationSec: number,
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(midi);

    const attack = 0.012;
    const release = Math.min(0.18, durationSec * 0.35);
    const peak = 0.9;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + attack);
    gain.gain.exponentialRampToValueAtTime(peak * 0.55, when + Math.max(attack, durationSec * 0.4));
    gain.gain.exponentialRampToValueAtTime(0.0001, when + durationSec + release);

    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + durationSec + release + 0.02);
    this.nodes.push(osc);

    const onDelay = Math.max(0, (when - ctx.currentTime) * 1000);
    const offDelay = Math.max(0, (when + durationSec - ctx.currentTime) * 1000);
    this.noteOffTimers.push(
      window.setTimeout(() => this.onNote?.(midi, true, staffIndex), onDelay),
      window.setTimeout(() => this.onNote?.(midi, false, staffIndex), offDelay),
    );
  }
}

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}
