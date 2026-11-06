export type GuidedPhase = "idle" | "ready" | "playing" | "demo" | "complete";

export interface FreePracticeSnapshot {
  phase: GuidedPhase;
  phrase: number[];
  cursor: number;
  /** MIDI currently expected (guided) or demo-highlighted. */
  expectedMidi: number | null;
  wrongFlash: number | null;
  demoIndex: number;
}

type Listener = (snap: FreePracticeSnapshot) => void;

const DEMO_MS = 400;
const WRONG_FLASH_MS = 220;

/**
 * Guided call-and-response + timed demo for Free Practice riffs.
 * Free (scale-map) mode does not use this engine for lighting.
 */
export class FreePracticeEngine {
  private listeners = new Set<Listener>();
  private phase: GuidedPhase = "idle";
  private phrase: number[] = [];
  private cursor = 0;
  private expectedMidi: number | null = null;
  private wrongFlash: number | null = null;
  private demoIndex = -1;
  private demoTimer: ReturnType<typeof setTimeout> | null = null;
  private wrongTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): FreePracticeSnapshot {
    return {
      phase: this.phase,
      phrase: [...this.phrase],
      cursor: this.cursor,
      expectedMidi: this.expectedMidi,
      wrongFlash: this.wrongFlash,
      demoIndex: this.demoIndex,
    };
  }

  /** Load a phrase and wait for note-ons (Guided mode). */
  loadPhrase(midis: number[]): void {
    this.stopTimers();
    this.generation += 1;
    this.phrase = [...midis];
    this.cursor = 0;
    this.demoIndex = -1;
    this.wrongFlash = null;
    if (this.phrase.length === 0) {
      this.phase = "idle";
      this.expectedMidi = null;
    } else {
      this.phase = "ready";
      this.expectedMidi = this.phrase[0]!;
      this.phase = "playing";
    }
    this.emit();
  }

  clear(): void {
    this.stopTimers();
    this.generation += 1;
    this.phase = "idle";
    this.phrase = [];
    this.cursor = 0;
    this.expectedMidi = null;
    this.wrongFlash = null;
    this.demoIndex = -1;
    this.emit();
  }

  stop(): void {
    this.clear();
  }

  /** Walk the phrase on lights without requiring input. */
  startDemo(midis?: number[]): void {
    if (midis) {
      this.phrase = [...midis];
    }
    if (this.phrase.length === 0) return;
    this.stopTimers();
    const gen = ++this.generation;
    this.phase = "demo";
    this.cursor = 0;
    this.wrongFlash = null;
    this.demoIndex = 0;
    this.expectedMidi = this.phrase[0]!;
    this.emit();

    const step = () => {
      if (gen !== this.generation) return;
      const next = this.demoIndex + 1;
      if (next >= this.phrase.length) {
        this.demoIndex = -1;
        this.expectedMidi = this.phrase[0]!;
        this.cursor = 0;
        this.phase = "playing";
        this.emit();
        return;
      }
      this.demoIndex = next;
      this.expectedMidi = this.phrase[next]!;
      this.emit();
      this.demoTimer = setTimeout(step, DEMO_MS);
    };
    this.demoTimer = setTimeout(step, DEMO_MS);
  }

  noteOn(midi: number): void {
    if (this.phase !== "playing" && this.phase !== "ready") return;
    if (this.cursor >= this.phrase.length) return;
    const expected = this.phrase[this.cursor]!;
    // Match pitch class OR exact midi — prefer exact, allow octave-equivalent
    const hit = midi === expected || midi % 12 === expected % 12;
    if (!hit) {
      this.flashWrong(midi);
      return;
    }
    this.cursor += 1;
    this.wrongFlash = null;
    if (this.cursor >= this.phrase.length) {
      this.phase = "complete";
      this.expectedMidi = null;
      this.emit();
      return;
    }
    this.phase = "playing";
    this.expectedMidi = this.phrase[this.cursor]!;
    this.emit();
  }

  /** Restart guided play from the start of the current phrase. */
  restart(): void {
    if (this.phrase.length === 0) {
      this.clear();
      return;
    }
    this.stopTimers();
    this.generation += 1;
    this.cursor = 0;
    this.demoIndex = -1;
    this.wrongFlash = null;
    this.phase = "playing";
    this.expectedMidi = this.phrase[0]!;
    this.emit();
  }

  private flashWrong(midi: number): void {
    if (this.wrongTimer) clearTimeout(this.wrongTimer);
    this.wrongFlash = midi;
    this.emit();
    this.wrongTimer = setTimeout(() => {
      this.wrongFlash = null;
      this.emit();
    }, WRONG_FLASH_MS);
  }

  private stopTimers(): void {
    if (this.demoTimer) {
      clearTimeout(this.demoTimer);
      this.demoTimer = null;
    }
    if (this.wrongTimer) {
      clearTimeout(this.wrongTimer);
      this.wrongTimer = null;
    }
  }

  private emit(): void {
    const snap = this.snapshot();
    for (const l of this.listeners) l(snap);
  }
}
