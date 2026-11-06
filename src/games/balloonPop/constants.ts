/** C major white keys C4–G4 (Easy singles). */
export const EASY_SCALE_MIDI = [60, 62, 64, 65, 67] as const;

/** C major white keys C4–B4 (Medium/Hard singles). */
export const FULL_SCALE_MIDI = [60, 62, 64, 65, 67, 69, 71] as const;

export type Difficulty = "easy" | "medium" | "hard";

export const DEFAULT_DIFFICULTY: Difficulty = "medium";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  easy: "Easy",
  medium: "Medium",
  hard: "Hard",
};

export interface ChordDef {
  id: string;
  label: string;
  midis: readonly number[];
}

/** Root-position C / F / G major in the C4–D5 neighborhood. */
export const CHORDS: readonly ChordDef[] = [
  { id: "C", label: "C", midis: [60, 64, 67] },
  { id: "F", label: "F", midis: [65, 69, 72] },
  { id: "G", label: "G", midis: [67, 71, 74] },
];

export interface DifficultyConfig {
  balloonCount: number;
  /** How long a balloon stays on-screen once spawned. */
  flyDurationMs: number;
  /** Nominal gap between spawn times. */
  spawnGapMs: number;
  maxConcurrent: number;
  /** 0–1 chance a balloon is a chord (ignored when chords are empty). */
  chordChance: number;
  singlePool: readonly number[];
  chords: readonly ChordDef[];
}

export const DIFFICULTY: Record<Difficulty, DifficultyConfig> = {
  easy: {
    balloonCount: 12,
    flyDurationMs: 5500,
    spawnGapMs: 2800,
    maxConcurrent: 2,
    chordChance: 0,
    singlePool: EASY_SCALE_MIDI,
    chords: [],
  },
  medium: {
    balloonCount: 20,
    flyDurationMs: 4000,
    spawnGapMs: 1800,
    maxConcurrent: 2,
    chordChance: 0.25,
    singlePool: FULL_SCALE_MIDI,
    chords: CHORDS,
  },
  hard: {
    balloonCount: 28,
    flyDurationMs: 2800,
    spawnGapMs: 900,
    maxConcurrent: 3,
    chordChance: 0.45,
    singlePool: FULL_SCALE_MIDI,
    chords: CHORDS,
  },
};

/** Fixed countdown before the first balloon (no BPM in this game). */
export const COUNT_IN_MS = 3000;

/** Notes pressed within this window still count toward a chord. */
export const CHORD_GRACE_MS = 450;

export const BALLOON_COLORS = [
  "#ff6b8a",
  "#ff9f43",
  "#feca57",
  "#54a0ff",
  "#5f27cd",
  "#1dd1a1",
  "#ff9ff3",
  "#48dbfb",
] as const;
