import {
  FREE_WINDOW_HIGH,
  FREE_WINDOW_LOW,
  midisForPitchClasses,
  normalizePc,
  type PitchClass,
} from "./pitch";

export type ScaleId =
  | "major"
  | "naturalMinor"
  | "harmonicMinor"
  | "majorPentatonic"
  | "minorPentatonic"
  | "blues"
  | "dorian"
  | "mixolydian"
  | "phrygian";

export interface ScaleDef {
  id: ScaleId;
  name: string;
  /** Semitone offsets from root (excluding the octave). */
  intervals: readonly number[];
}

export const SCALES: readonly ScaleDef[] = [
  { id: "major", name: "Major", intervals: [0, 2, 4, 5, 7, 9, 11] },
  { id: "naturalMinor", name: "Natural minor", intervals: [0, 2, 3, 5, 7, 8, 10] },
  { id: "harmonicMinor", name: "Harmonic minor", intervals: [0, 2, 3, 5, 7, 8, 11] },
  { id: "majorPentatonic", name: "Major pentatonic", intervals: [0, 2, 4, 7, 9] },
  { id: "minorPentatonic", name: "Minor pentatonic", intervals: [0, 3, 5, 7, 10] },
  { id: "blues", name: "Blues", intervals: [0, 3, 5, 6, 7, 10] },
  { id: "dorian", name: "Dorian", intervals: [0, 2, 3, 5, 7, 9, 10] },
  { id: "mixolydian", name: "Mixolydian", intervals: [0, 2, 4, 5, 7, 9, 10] },
  { id: "phrygian", name: "Phrygian", intervals: [0, 1, 3, 5, 7, 8, 10] },
];

const BY_ID = new Map(SCALES.map((s) => [s.id, s]));

export function getScale(id: ScaleId): ScaleDef {
  return BY_ID.get(id) ?? SCALES[0]!;
}

export function scalePitchClasses(rootPc: PitchClass, scaleId: ScaleId): PitchClass[] {
  const root = normalizePc(rootPc);
  return getScale(scaleId).intervals.map((i) => normalizePc(root + i));
}

export function buildScaleMidis(
  rootPc: PitchClass,
  scaleId: ScaleId,
  lo = FREE_WINDOW_LOW,
  hi = FREE_WINDOW_HIGH,
): number[] {
  return midisForPitchClasses(scalePitchClasses(rootPc, scaleId), lo, hi);
}

/** Nearest MIDI for a pitch class near `preferMidi`. */
export function nearestMidiForPc(pc: PitchClass, preferMidi: number): number {
  const target = normalizePc(pc);
  let best = target + 12 * 5;
  let bestDist = Infinity;
  for (let k = 2; k <= 8; k++) {
    const m = target + 12 * k;
    const dist = Math.abs(m - preferMidi);
    if (dist < bestDist) {
      bestDist = dist;
      best = m;
    }
  }
  return best;
}

/**
 * Resolve absolute scale-degree indices to MIDI.
 * Degree 0 = tonic near `startMidi`; degree N = tonic one octave up (N = scale length).
 */
export function degreesToMidis(
  rootPc: PitchClass,
  scaleId: ScaleId,
  degrees: readonly number[],
  startMidi = 60,
): number[] {
  const intervals = getScale(scaleId).intervals;
  const n = intervals.length;
  const root = normalizePc(rootPc);
  const rootMidi = nearestMidiForPc(root, startMidi);

  return degrees.map((d) => {
    const step = ((d % n) + n) % n;
    const oct = Math.floor(d / n);
    return rootMidi + intervals[step]! + oct * 12;
  });
}
