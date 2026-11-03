import type { Hand, ScoreEvent, LoadedScore } from "../score/types";
import { filterEventByHand, pitchClassSet } from "../score/types";

export type NoteResult = "pending" | "correct" | "hinted" | "wrong";

export interface FeedbackState {
  eventIndex: number;
  expected: Set<number>;
  heldCorrect: Set<number>;
  wrongFlash: Set<number>;
  hinted: boolean;
  results: NoteResult[]; // per event
  done: boolean;
  statusText: string;
}

export type FeedbackListener = (state: FeedbackState) => void;

export class FeedbackEngine {
  private score: LoadedScore | null = null;
  private hand: Hand = "both";
  private eventIndex = 0;
  private heldCorrect = new Set<number>();
  private wrongFlash = new Set<number>();
  private hinted = false;
  private results: NoteResult[] = [];
  private wrongAttempts = 0;
  private listeners = new Set<FeedbackListener>();
  private autoHintAfter = 3;

  load(score: LoadedScore, hand: Hand = "both") {
    this.score = score;
    this.hand = hand;
    this.reset();
  }

  setHand(hand: Hand) {
    this.hand = hand;
    this.reset();
  }

  reset() {
    this.eventIndex = 0;
    this.heldCorrect.clear();
    this.wrongFlash.clear();
    this.hinted = false;
    this.wrongAttempts = 0;
    this.results = this.score ? this.score.events.map(() => "pending" as NoteResult) : [];
    this.emit();
  }

  showHint() {
    this.hinted = true;
    this.emit();
  }

  getState(): FeedbackState {
    const event = this.currentEvent();
    const expected = event ? pitchClassSet(event.notes) : new Set<number>();
    return {
      eventIndex: this.eventIndex,
      expected,
      heldCorrect: new Set(this.heldCorrect),
      wrongFlash: new Set(this.wrongFlash),
      hinted: this.hinted,
      results: [...this.results],
      done: this.score != null && this.eventIndex >= (this.score.events.length || 0),
      statusText: this.statusText(expected),
    };
  }

  subscribe(listener: FeedbackListener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Call on note-on from piano */
  noteOn(midi: number) {
    if (!this.score || this.eventIndex >= this.score.events.length) return;

    const event = this.currentEvent();
    if (!event || event.notes.length === 0) {
      this.advance();
      return;
    }

    const expected = pitchClassSet(event.notes);

    if (expected.has(midi)) {
      this.heldCorrect.add(midi);
      this.wrongFlash.delete(midi);
      if (this.isComplete(expected)) {
        this.results[this.eventIndex] = this.hinted ? "hinted" : "correct";
        this.advance();
      } else {
        this.emit();
      }
      return;
    }

    // Wrong note
    this.wrongFlash.add(midi);
    this.wrongAttempts += 1;
    if (this.wrongAttempts >= this.autoHintAfter) {
      this.hinted = true;
    }
    this.emit();

    // Clear wrong flash shortly
    window.setTimeout(() => {
      this.wrongFlash.delete(midi);
      this.emit();
    }, 350);
  }

  noteOff(midi: number) {
    // Wait-for-me does not require holding; ignore releases for advance
    void midi;
  }

  private currentEvent(): ScoreEvent | null {
    if (!this.score) return null;
    const raw = this.score.events[this.eventIndex];
    if (!raw) return null;
    const filtered = filterEventByHand(raw, this.hand);
    // Skip empty events after hand filter
    if (filtered.notes.length === 0) return filtered;
    return filtered;
  }

  private isComplete(expected: Set<number>) {
    for (const n of expected) {
      if (!this.heldCorrect.has(n)) return false;
    }
    return expected.size > 0;
  }

  private advance() {
    this.eventIndex += 1;
    this.heldCorrect.clear();
    this.wrongFlash.clear();
    this.hinted = false;
    this.wrongAttempts = 0;

    // Skip hand-filtered empty events
    while (this.score && this.eventIndex < this.score.events.length) {
      const next = this.currentEvent();
      if (next && next.notes.length > 0) break;
      this.results[this.eventIndex] = "correct";
      this.eventIndex += 1;
    }

    this.emit();
  }

  private statusText(expected: Set<number>) {
    if (!this.score) return "Load a MusicXML score to begin.";
    if (this.eventIndex >= this.score.events.length) return "Finished — nice work.";
    if (expected.size === 0) return "…";
    const names = [...expected]
      .sort((a, b) => a - b)
      .map((n) => midiName(n))
      .join(" + ");
    const progress = `${this.eventIndex + 1}/${this.score.events.length}`;
    return `Waiting for ${names} · ${progress}`;
  }

  private emit() {
    const state = this.getState();
    for (const listener of this.listeners) listener(state);
  }
}

function midiName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[note % 12]}${Math.floor(note / 12) - 1}`;
}
