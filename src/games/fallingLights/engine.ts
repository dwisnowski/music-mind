import { GameClock } from "../clock";
import { gradeTiming, GOOD_WINDOW_MS, isPastMiss } from "../judgment";
import {
  emptySessionScore,
  type GameLane,
  type JudgmentGrade,
  type SessionScore,
} from "../types";
import {
  COUNT_IN_BEATS,
  DEFAULT_BPM,
  DEFAULT_PATTERN_BEATS,
  FALL_BEATS,
  FALLING_LEFT_MIDI,
  FALLING_RIGHT_MIDI,
} from "./constants";
import { buildFallingLightsPattern } from "./patterns";

export type FallingLightsPhase = "idle" | "countdown" | "playing" | "finished";

export interface FallingTarget {
  id: string;
  lane: GameLane;
  midi: number;
  /** Absolute performance.now() when the target crosses the judgment line. */
  hitTimePerf: number;
  judged: boolean;
  result?: JudgmentGrade;
}

export interface FallingLightsSnapshot {
  phase: FallingLightsPhase;
  bpm: number;
  msPerBeat: number;
  fallDurationMs: number;
  countInBeats: number;
  /** 1-based beat during countdown; 0 otherwise. */
  countInBeat: number;
  targets: FallingTarget[];
  score: SessionScore;
  lastFlash: { lane: GameLane; grade: JudgmentGrade; atPerf: number } | null;
  homeKeys: { left: number; right: number };
}

type Listener = (snap: FallingLightsSnapshot) => void;

export class FallingLightsEngine {
  private clock = new GameClock();
  private listeners = new Set<Listener>();
  private phase: FallingLightsPhase = "idle";
  private bpm = DEFAULT_BPM;
  private targets: FallingTarget[] = [];
  private score = emptySessionScore();
  private lastFlash: FallingLightsSnapshot["lastFlash"] = null;
  private raf = 0;
  private finishedScheduled = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(nowPerf = performance.now()): FallingLightsSnapshot {
    const msPerBeat = 60_000 / this.bpm;
    const fallDurationMs = FALL_BEATS * msPerBeat;
    let countInBeat = 0;
    if (this.phase === "countdown" && this.clock.isRunning()) {
      const elapsed = this.clock.elapsed(nowPerf);
      countInBeat = Math.min(COUNT_IN_BEATS, Math.floor(elapsed / msPerBeat) + 1);
    }
    return {
      phase: this.phase,
      bpm: this.bpm,
      msPerBeat,
      fallDurationMs,
      countInBeats: COUNT_IN_BEATS,
      countInBeat,
      targets: this.targets,
      score: { ...this.score },
      lastFlash: this.lastFlash,
      homeKeys: { left: FALLING_LEFT_MIDI, right: FALLING_RIGHT_MIDI },
    };
  }

  start(bpm = DEFAULT_BPM): void {
    this.stopLoop();
    this.bpm = Math.min(200, Math.max(40, bpm));
    const msPerBeat = 60_000 / this.bpm;
    const now = performance.now();
    this.clock.start(now);
    this.phase = "countdown";
    this.score = emptySessionScore();
    this.lastFlash = null;
    this.finishedScheduled = false;

    const playStartPerf = now + COUNT_IN_BEATS * msPerBeat;
    const pattern = buildFallingLightsPattern(DEFAULT_PATTERN_BEATS);
    this.targets = pattern.map((note, i) => ({
      id: `t-${i}-${note.lane}-${note.beat}`,
      lane: note.lane,
      midi: note.midi,
      hitTimePerf: playStartPerf + note.beat * msPerBeat,
      judged: false,
    }));
    this.score.total = this.targets.length;

    this.emit();
    this.loop();
  }

  stop(): void {
    this.stopLoop();
    this.clock.stop();
    this.phase = "idle";
    this.targets = [];
    this.score = emptySessionScore();
    this.lastFlash = null;
    this.finishedScheduled = false;
    this.emit();
  }

  /** MIDI or on-screen note-on. `midiTimestamp` optional (DOMHighRes from Web MIDI). */
  noteOn(midi: number, midiTimestamp?: number): void {
    if (this.phase !== "playing" && this.phase !== "countdown") return;

    const nowPerf = this.clock.toPerf(midiTimestamp);
    const lane = laneForMidi(midi);
    if (!lane) return;

    if (this.phase === "countdown") {
      this.phase = "playing";
    }

    const candidate = this.targets
      .filter((t) => !t.judged && t.lane === lane)
      .map((t) => ({ t, delta: nowPerf - t.hitTimePerf }))
      .filter(({ delta }) => delta >= -GOOD_WINDOW_MS && delta <= GOOD_WINDOW_MS)
      .sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta))[0];

    if (!candidate) return;

    const grade = gradeTiming(candidate.delta);
    if (!grade) return;

    this.applyHit(candidate.t, grade, nowPerf);
  }

  private applyHit(target: FallingTarget, grade: JudgmentGrade, atPerf: number): void {
    if (target.judged) return;
    target.judged = true;
    target.result = grade;
    this.score.hits += 1;
    if (grade === "perfect") this.score.perfect += 1;
    else this.score.good += 1;
    this.score.combo += 1;
    this.score.maxCombo = Math.max(this.score.maxCombo, this.score.combo);
    this.lastFlash = { lane: target.lane, grade, atPerf };
    this.emit();
    this.maybeFinish(atPerf);
  }

  private applyMiss(target: FallingTarget, atPerf: number): void {
    if (target.judged) return;
    target.judged = true;
    target.result = "miss";
    this.score.miss += 1;
    this.score.combo = 0;
    this.lastFlash = { lane: target.lane, grade: "miss", atPerf };
    this.emit();
    this.maybeFinish(atPerf);
  }

  private maybeFinish(nowPerf: number): void {
    if (this.finishedScheduled) return;
    if (!this.targets.every((t) => t.judged)) return;
    this.finishedScheduled = true;
    // Brief pause so the last flash is visible
    window.setTimeout(() => {
      if (this.phase !== "playing") return;
      this.phase = "finished";
      this.clock.stop();
      this.stopLoop();
      this.emit(nowPerf);
    }, 400);
  }

  private loop = (): void => {
    const now = performance.now();

    if (this.phase === "countdown") {
      const msPerBeat = 60_000 / this.bpm;
      if (this.clock.elapsed(now) >= COUNT_IN_BEATS * msPerBeat) {
        this.phase = "playing";
      }
      this.emit(now);
    } else if (this.phase === "playing") {
      for (const t of this.targets) {
        if (t.judged) continue;
        const delta = now - t.hitTimePerf;
        if (isPastMiss(delta)) {
          this.applyMiss(t, now);
        }
      }
      this.emit(now);
    }

    if (this.phase === "countdown" || this.phase === "playing") {
      this.raf = requestAnimationFrame(this.loop);
    }
  };

  private stopLoop(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private emit(nowPerf = performance.now()): void {
    const snap = this.snapshot(nowPerf);
    for (const listener of this.listeners) listener(snap);
  }
}

function laneForMidi(midi: number): GameLane | null {
  if (midi === FALLING_LEFT_MIDI) return "left";
  if (midi === FALLING_RIGHT_MIDI) return "right";
  return null;
}
