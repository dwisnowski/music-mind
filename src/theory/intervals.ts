import { normalizePc } from "./pitch";

export type Consonance = "consonant" | "tense" | "dissonant";

export interface IntervalInfo {
  semitones: number;
  name: string;
  short: string;
  consonance: Consonance;
  tip: string;
}

const INTERVAL_TABLE: Record<number, Omit<IntervalInfo, "semitones">> = {
  0: {
    name: "Unison",
    short: "P1",
    consonance: "consonant",
    tip: "Same pitch — total agreement.",
  },
  1: {
    name: "Minor second",
    short: "m2",
    consonance: "dissonant",
    tip: "Clashy — use as tension, then resolve by step.",
  },
  2: {
    name: "Major second",
    short: "M2",
    consonance: "tense",
    tip: "Mildly restless; common as a passing tone.",
  },
  3: {
    name: "Minor third",
    short: "m3",
    consonance: "consonant",
    tip: "Warm minor color — foundation of minor triads.",
  },
  4: {
    name: "Major third",
    short: "M3",
    consonance: "consonant",
    tip: "Bright major color — foundation of major triads.",
  },
  5: {
    name: "Perfect fourth",
    short: "P4",
    consonance: "tense",
    tip: "Open but wants to settle — often resolves to a third.",
  },
  6: {
    name: "Tritone",
    short: "TT",
    consonance: "dissonant",
    tip: "Maximum tension — the engine inside V7 → I.",
  },
  7: {
    name: "Perfect fifth",
    short: "P5",
    consonance: "consonant",
    tip: "Very stable — power chords and triad skeletons.",
  },
  8: {
    name: "Minor sixth",
    short: "m6",
    consonance: "consonant",
    tip: "Sweet, slightly yearning — inversion of a major third.",
  },
  9: {
    name: "Major sixth",
    short: "M6",
    consonance: "consonant",
    tip: "Open and friendly — inversion of a minor third.",
  },
  10: {
    name: "Minor seventh",
    short: "m7",
    consonance: "tense",
    tip: "Bluesy / dominant flavor — wants to resolve.",
  },
  11: {
    name: "Major seventh",
    short: "M7",
    consonance: "tense",
    tip: "Dreamy jazz color — spicy against the root.",
  },
};

export function classifyPair(a: number, b: number): IntervalInfo {
  const semi = normalizePc(Math.abs(a - b));
  const meta = INTERVAL_TABLE[semi]!;
  return {
    semitones: semi,
    name: meta.name,
    short: meta.short,
    consonance: meta.consonance,
    tip: meta.tip,
  };
}

export interface HeldAnalysis {
  /** Pairwise intervals from lowest note upward (adjacent in sorted order). */
  adjacent: IntervalInfo[];
  /** Interval from bass to each upper note. */
  fromBass: IntervalInfo[];
  summary: string;
}

export function classifyHeld(midis: Iterable<number>): HeldAnalysis | null {
  const sorted = [...new Set(midis)].sort((a, b) => a - b);
  if (sorted.length < 2) return null;

  const adjacent: IntervalInfo[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    adjacent.push(classifyPair(sorted[i]!, sorted[i + 1]!));
  }

  const bass = sorted[0]!;
  const fromBass = sorted.slice(1).map((m) => classifyPair(bass, m));

  const worst = [...adjacent, ...fromBass].reduce((acc, cur) => {
    const rank = { consonant: 0, tense: 1, dissonant: 2 } as const;
    return rank[cur.consonance] > rank[acc.consonance] ? cur : acc;
  });

  const summary =
    worst.consonance === "consonant"
      ? "These tones blend — safe to land together."
      : worst.consonance === "tense"
        ? "Mild tension — expressive; resolve by step for a clean landing."
        : "Strong clash — great as spice; move one note by a step to resolve.";

  return { adjacent, fromBass, summary };
}
