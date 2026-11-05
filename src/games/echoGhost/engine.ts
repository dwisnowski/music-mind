import { emptySessionScore, type SessionScore } from "../types";
import {
  COUNT_IN_BEATS,
  DEFAULT_BPM,
  NOTE_BEATS,
  ROUND_COUNT,
  ROUND_LENGTHS,
} from "./constants";
import { generateEchoPhrase } from "./patterns";
import { PhrasePlayer } from "./phrasePlayer";

export type EchoGhostPhase =
  | "idle"
  | "listening"
  | "echoing"
  | "roundResult"
  | "finished";

export type EchoSlotResult = "pending" | "hit" | "miss";

export interface EchoGhostSnapshot {
  phase: EchoGhostPhase;
  bpm: number;
  roundIndex: number;
  roundCount: number;
  expected: number[];
  results: EchoSlotResult[];
  cursor: number;
  /** Index of the note currently sounding during listen (-1 if none). */
  listenIndex: number;
  /** MIDI currently ghost-lit during listen playback. */
  ghostMidi: number | null;
  score: SessionScore;
  lastRoundHits: number;
  lastRoundMisses: number;
}

type Listener = (snap: EchoGhostSnapshot) => void;

export class EchoGhostEngine {
  private listeners = new Set<Listener>();
  private player = new PhrasePlayer();
  private phase: EchoGhostPhase = "idle";
  private bpm = DEFAULT_BPM;
  private roundIndex = 0;
  private expected: number[] = [];
  private results: EchoSlotResult[] = [];
  private cursor = 0;
  private listenIndex = -1;
  private ghostMidi: number | null = null;
  private score = emptySessionScore();
  private lastRoundHits = 0;
  private lastRoundMisses = 0;
  private generation = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): EchoGhostSnapshot {
    return {
      phase: this.phase,
      bpm: this.bpm,
      roundIndex: this.roundIndex,
      roundCount: ROUND_COUNT,
      expected: [...this.expected],
      results: [...this.results],
      cursor: this.cursor,
      listenIndex: this.listenIndex,
      ghostMidi: this.ghostMidi,
      score: { ...this.score },
      lastRoundHits: this.lastRoundHits,
      lastRoundMisses: this.lastRoundMisses,
    };
  }

  start(bpm = DEFAULT_BPM): void {
    this.stopPlayer();
    this.bpm = Math.min(200, Math.max(40, bpm));
    this.roundIndex = 0;
    this.score = emptySessionScore();
    this.lastRoundHits = 0;
    this.lastRoundMisses = 0;
    this.beginRound();
  }

  /** Advance from roundResult into the next listen (or no-op if finished). */
  continueAfterRound(): void {
    if (this.phase !== "roundResult") return;
    if (this.roundIndex + 1 >= ROUND_COUNT) {
      this.phase = "finished";
      this.emit();
      return;
    }
    this.roundIndex += 1;
    this.beginRound();
  }

  stop(): void {
    this.generation += 1;
    this.stopPlayer();
    this.phase = "idle";
    this.expected = [];
    this.results = [];
    this.cursor = 0;
    this.listenIndex = -1;
    this.ghostMidi = null;
    this.roundIndex = 0;
    this.score = emptySessionScore();
    this.lastRoundHits = 0;
    this.lastRoundMisses = 0;
    this.emit();
  }

  noteOn(midi: number): void {
    if (this.phase !== "echoing") return;
    if (this.cursor >= this.expected.length) return;

    const expected = this.expected[this.cursor]!;
    const ok = midi === expected;
    this.results[this.cursor] = ok ? "hit" : "miss";
    if (ok) {
      this.score.hits += 1;
      this.score.combo += 1;
      this.score.maxCombo = Math.max(this.score.maxCombo, this.score.combo);
    } else {
      this.score.miss += 1;
      this.score.combo = 0;
    }
    this.cursor += 1;
    this.emit();

    if (this.cursor >= this.expected.length) {
      this.finishRound();
    }
  }

  private beginRound(): void {
    const length = ROUND_LENGTHS[this.roundIndex] ?? 3;
    this.expected = generateEchoPhrase(length);
    this.results = this.expected.map(() => "pending");
    this.cursor = 0;
    this.listenIndex = -1;
    this.ghostMidi = null;
    this.score.total += this.expected.length;
    this.phase = "listening";
    this.emit();

    const gen = ++this.generation;
    const leadInSec = (COUNT_IN_BEATS * 60) / this.bpm;
    let nextListen = 0;

    void this.player.play(this.expected, {
      bpm: this.bpm,
      noteBeats: NOTE_BEATS,
      leadInSec,
      onNote: (midi, on) => {
        if (gen !== this.generation) return;
        if (on) {
          this.listenIndex = nextListen;
          this.ghostMidi = midi;
          nextListen += 1;
        } else if (this.ghostMidi === midi) {
          this.ghostMidi = null;
          this.listenIndex = -1;
        }
        this.emit();
      },
      onEnded: () => {
        if (gen !== this.generation) return;
        this.ghostMidi = null;
        this.listenIndex = -1;
        this.phase = "echoing";
        this.emit();
      },
    });
  }

  private finishRound(): void {
    this.lastRoundHits = this.results.filter((r) => r === "hit").length;
    this.lastRoundMisses = this.results.filter((r) => r === "miss").length;
    this.phase = "roundResult";
    this.emit();

    const gen = this.generation;
    window.setTimeout(() => {
      if (gen !== this.generation) return;
      if (this.phase !== "roundResult") return;
      this.continueAfterRound();
    }, 1200);
  }

  private stopPlayer(): void {
    this.player.stop({ emitEnded: false });
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }
}
