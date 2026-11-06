import { GameClock } from "../clock";
import { emptySessionScore, type SessionScore } from "../types";
import {
  CHORD_GRACE_MS,
  COUNT_IN_MS,
  DEFAULT_DIFFICULTY,
  DIFFICULTY,
  type Difficulty,
} from "./constants";
import { buildBalloonWave, type BalloonSpec } from "./patterns";

export type BalloonPopPhase = "idle" | "countdown" | "playing" | "finished";

export type BalloonState = "pending" | "flying" | "popping" | "falling" | "missed";

export interface BalloonTarget {
  id: string;
  kind: BalloonSpec["kind"];
  midis: number[];
  label: string;
  spawnOffsetMs: number;
  flyDurationMs: number;
  band: number;
  colorIndex: number;
  state: BalloonState;
  /** performance.now() when spawned into flying. */
  spawnPerf: number;
  /** performance.now() when popped (for fall animation). */
  popPerf: number;
  judged: boolean;
}

export interface BalloonPopSnapshot {
  phase: BalloonPopPhase;
  difficulty: Difficulty;
  countInMs: number;
  /** 1-based second during countdown; 0 otherwise. */
  countInBeat: number;
  balloons: BalloonTarget[];
  score: SessionScore;
  /** Pitches of the oldest flying balloon (keyboard hint). */
  expectedMidis: number[];
  lastPop: { rootMidi: number; atPerf: number; label: string } | null;
}

type Listener = (snap: BalloonPopSnapshot) => void;

export class BalloonPopEngine {
  private clock = new GameClock();
  private listeners = new Set<Listener>();
  private phase: BalloonPopPhase = "idle";
  private difficulty: Difficulty = DEFAULT_DIFFICULTY;
  private balloons: BalloonTarget[] = [];
  private score = emptySessionScore();
  private lastPop: BalloonPopSnapshot["lastPop"] = null;
  private held = new Set<number>();
  private recentOn = new Map<number, number>();
  private playStartPerf = 0;
  private raf = 0;
  private finishedScheduled = false;

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(nowPerf = performance.now()): BalloonPopSnapshot {
    let countInBeat = 0;
    if (this.phase === "countdown" && this.clock.isRunning()) {
      const elapsed = this.clock.elapsed(nowPerf);
      countInBeat = Math.min(3, Math.floor(elapsed / 1000) + 1);
    }

    const expectedMidis = this.oldestFlying()?.midis.slice() ?? [];

    return {
      phase: this.phase,
      difficulty: this.difficulty,
      countInMs: COUNT_IN_MS,
      countInBeat,
      balloons: this.balloons,
      score: { ...this.score },
      expectedMidis,
      lastPop: this.lastPop,
    };
  }

  start(difficulty: Difficulty = DEFAULT_DIFFICULTY): void {
    this.stopLoop();
    this.difficulty = difficulty in DIFFICULTY ? difficulty : DEFAULT_DIFFICULTY;
    const now = performance.now();
    this.clock.start(now);
    this.phase = "countdown";
    this.score = emptySessionScore();
    this.lastPop = null;
    this.finishedScheduled = false;
    this.held.clear();
    this.recentOn.clear();
    this.playStartPerf = now + COUNT_IN_MS;

    const wave = buildBalloonWave(this.difficulty);
    this.balloons = wave.map((spec) => ({
      ...spec,
      midis: [...spec.midis],
      state: "pending" as BalloonState,
      spawnPerf: 0,
      popPerf: 0,
      judged: false,
    }));
    this.score.total = this.balloons.length;

    this.emit();
    this.loop();
  }

  stop(): void {
    this.stopLoop();
    this.clock.stop();
    this.phase = "idle";
    this.balloons = [];
    this.score = emptySessionScore();
    this.lastPop = null;
    this.finishedScheduled = false;
    this.held.clear();
    this.recentOn.clear();
    this.emit();
  }

  noteOn(midi: number, _midiTimestamp?: number): void {
    if (this.phase !== "playing" && this.phase !== "countdown") return;
    const now = performance.now();
    this.held.add(midi);
    this.recentOn.set(midi, now);

    if (this.phase === "countdown") {
      // Allow early input during countdown without advancing; match only while playing.
      this.emit(now);
      return;
    }

    this.tryMatch(now);
  }

  noteOff(midi: number): void {
    this.held.delete(midi);
  }

  private tryMatch(nowPerf: number): void {
    const active = this.activePitches(nowPerf);
    const flying = this.balloons
      .filter((b) => !b.judged && b.state === "flying")
      .sort((a, b) => a.spawnPerf - b.spawnPerf);

    for (const balloon of flying) {
      if (balloon.midis.every((m) => active.has(m))) {
        this.applyHit(balloon, nowPerf);
        return;
      }
    }
  }

  private activePitches(nowPerf: number): Set<number> {
    const set = new Set(this.held);
    for (const [midi, at] of this.recentOn) {
      if (nowPerf - at <= CHORD_GRACE_MS) set.add(midi);
      else this.recentOn.delete(midi);
    }
    return set;
  }

  private oldestFlying(): BalloonTarget | null {
    let best: BalloonTarget | null = null;
    for (const b of this.balloons) {
      if (b.judged || b.state !== "flying") continue;
      if (!best || b.spawnPerf < best.spawnPerf) best = b;
    }
    return best;
  }

  private applyHit(balloon: BalloonTarget, atPerf: number): void {
    if (balloon.judged) return;
    balloon.judged = true;
    balloon.state = "popping";
    balloon.popPerf = atPerf;
    this.score.hits += 1;
    this.score.combo += 1;
    this.score.maxCombo = Math.max(this.score.maxCombo, this.score.combo);
    this.lastPop = {
      rootMidi: balloon.midis[0]!,
      atPerf,
      label: balloon.label,
    };
    // Move to falling shortly so canvas can show a burst then drop.
    window.setTimeout(() => {
      if (balloon.state === "popping") balloon.state = "falling";
      this.emit();
    }, 120);
    this.emit(atPerf);
    this.maybeFinish(atPerf);
  }

  private applyMiss(balloon: BalloonTarget, atPerf: number): void {
    if (balloon.judged) return;
    balloon.judged = true;
    balloon.state = "missed";
    this.score.miss += 1;
    this.score.combo = 0;
    this.emit(atPerf);
    this.maybeFinish(atPerf);
  }

  private maybeFinish(nowPerf: number): void {
    if (this.finishedScheduled) return;
    if (!this.balloons.every((b) => b.judged)) return;
    this.finishedScheduled = true;
    window.setTimeout(() => {
      if (this.phase !== "playing") return;
      this.phase = "finished";
      this.clock.stop();
      this.stopLoop();
      this.emit(nowPerf);
    }, 500);
  }

  private loop = (): void => {
    const now = performance.now();

    if (this.phase === "countdown") {
      if (this.clock.elapsed(now) >= COUNT_IN_MS) {
        this.phase = "playing";
      }
      this.emit(now);
    } else if (this.phase === "playing") {
      const playElapsed = now - this.playStartPerf;
      for (const b of this.balloons) {
        if (b.state === "pending" && playElapsed >= b.spawnOffsetMs) {
          b.state = "flying";
          b.spawnPerf = now;
        } else if (b.state === "flying" && !b.judged) {
          if (now - b.spawnPerf >= b.flyDurationMs) {
            this.applyMiss(b, now);
          }
        }
      }
      // Retry chord match in case held notes arrived before spawn.
      this.tryMatch(now);
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
