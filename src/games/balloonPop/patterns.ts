import {
  DIFFICULTY,
  type ChordDef,
  type Difficulty,
  type DifficultyConfig,
} from "./constants";

export type BalloonKind = "single" | "chord";

export interface BalloonSpec {
  id: string;
  kind: BalloonKind;
  midis: number[];
  label: string;
  /** Ms after play start when the balloon appears. */
  spawnOffsetMs: number;
  flyDurationMs: number;
  /** Vertical band 0–1 used as the balloon’s base Y. */
  band: number;
  colorIndex: number;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

function midiLabel(midi: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return names[midi % 12]!;
}

function makeSingle(cfg: DifficultyConfig, index: number): Omit<BalloonSpec, "spawnOffsetMs" | "flyDurationMs" | "band" | "colorIndex"> {
  const midi = pick(cfg.singlePool);
  return {
    id: `b-${index}-n-${midi}`,
    kind: "single",
    midis: [midi],
    label: midiLabel(midi),
  };
}

function makeChord(chord: ChordDef, index: number): Omit<BalloonSpec, "spawnOffsetMs" | "flyDurationMs" | "band" | "colorIndex"> {
  return {
    id: `b-${index}-c-${chord.id}`,
    kind: "chord",
    midis: [...chord.midis],
    label: chord.label,
  };
}

/**
 * Build a wave of balloons for the given difficulty.
 * Spawn times respect maxConcurrent against flyDurationMs.
 */
export function buildBalloonWave(difficulty: Difficulty): BalloonSpec[] {
  const cfg = DIFFICULTY[difficulty];
  const specs: BalloonSpec[] = [];
  const spawnTimes: number[] = [];

  for (let i = 0; i < cfg.balloonCount; i++) {
    const useChord =
      cfg.chords.length > 0 && Math.random() < cfg.chordChance;
    const base = useChord
      ? makeChord(pick(cfg.chords), i)
      : makeSingle(cfg, i);

    let spawnOffsetMs: number;
    if (i === 0) {
      spawnOffsetMs = 0;
    } else {
      const jitter = 0.85 + Math.random() * 0.3;
      let candidate = spawnTimes[i - 1]! + cfg.spawnGapMs * jitter;
      // Push later if we'd exceed max concurrent overlapping balloons.
      for (;;) {
        const active = spawnTimes.filter(
          (t) => t <= candidate && candidate < t + cfg.flyDurationMs,
        ).length;
        if (active < cfg.maxConcurrent) break;
        candidate += cfg.spawnGapMs * 0.35;
      }
      spawnOffsetMs = candidate;
    }
    spawnTimes.push(spawnOffsetMs);

    specs.push({
      ...base,
      spawnOffsetMs,
      flyDurationMs: cfg.flyDurationMs,
      band: 0.18 + Math.random() * 0.52,
      colorIndex: i % 8,
    });
  }

  return specs;
}
