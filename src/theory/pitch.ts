/** Pitch class 0 = C … 11 = B */
export type PitchClass = number;

export const PC_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

export const PC_NAMES_FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"] as const;

export function normalizePc(pc: number): PitchClass {
  return ((pc % 12) + 12) % 12;
}

export function midiToPc(midi: number): PitchClass {
  return normalizePc(midi);
}

export function pcName(pc: PitchClass, flats = false): string {
  const n = normalizePc(pc);
  return flats ? PC_NAMES_FLAT[n]! : PC_NAMES[n]!;
}

/** Default Free Practice lighting window: C3–B5 (3 octaves). */
export const FREE_WINDOW_LOW = 48; // C3
export const FREE_WINDOW_HIGH = 83; // B5

export function midisForPitchClasses(
  pcs: ReadonlySet<PitchClass> | readonly PitchClass[],
  lo = FREE_WINDOW_LOW,
  hi = FREE_WINDOW_HIGH,
): number[] {
  const set =
    pcs instanceof Set
      ? pcs
      : new Set(Array.from(pcs as readonly PitchClass[], normalizePc));
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) {
    if (set.has(midiToPc(m))) out.push(m);
  }
  return out;
}
