import { normalizePc, midisForPitchClasses, type PitchClass } from "./pitch";
import { getScale, type ScaleId } from "./scales";

export type ChordQuality = "maj" | "min" | "dim" | "aug" | "dom7" | "maj7" | "min7" | "dim7" | "halfDim7";

export interface DiatonicChord {
  /** 0-based degree in the scale (0 = I / i). */
  degree: number;
  roman: string;
  name: string;
  quality: ChordQuality;
  /** Pitch classes in the chord (root, third, fifth[, seventh]). */
  pitchClasses: PitchClass[];
  blurb: string;
}

const MAJOR_ROMANS = ["I", "ii", "iii", "IV", "V", "vi", "vii°"] as const;
const MINOR_ROMANS = ["i", "ii°", "III", "iv", "v", "VI", "VII"] as const;
const HARMONIC_MINOR_ROMANS = ["i", "ii°", "III+", "iv", "V", "VI", "vii°"] as const;

function triadQuality(root: number, third: number, fifth: number): ChordQuality {
  const t = normalizePc(third - root);
  const f = normalizePc(fifth - root);
  if (t === 4 && f === 7) return "maj";
  if (t === 3 && f === 7) return "min";
  if (t === 3 && f === 6) return "dim";
  if (t === 4 && f === 8) return "aug";
  return "maj";
}

function qualityLabel(q: ChordQuality): string {
  switch (q) {
    case "maj":
      return "major";
    case "min":
      return "minor";
    case "dim":
      return "diminished";
    case "aug":
      return "augmented";
    case "dom7":
      return "dominant 7";
    case "maj7":
      return "major 7";
    case "min7":
      return "minor 7";
    case "dim7":
      return "diminished 7";
    case "halfDim7":
      return "half-diminished 7";
  }
}

function romanFor(scaleId: ScaleId, degree: number, quality: ChordQuality): string {
  if (scaleId === "harmonicMinor") return HARMONIC_MINOR_ROMANS[degree] ?? String(degree + 1);
  if (
    scaleId === "naturalMinor" ||
    scaleId === "dorian" ||
    scaleId === "phrygian" ||
    scaleId === "minorPentatonic" ||
    scaleId === "blues"
  ) {
    return MINOR_ROMANS[degree] ?? String(degree + 1);
  }
  let r = MAJOR_ROMANS[degree] ?? String(degree + 1);
  if (quality === "dom7" || quality === "maj7" || quality === "min7") {
    r = r.replace("°", "") + "7";
  }
  return r;
}

const ROLE_BLURBS: Record<number, string> = {
  0: "Home. Resolve here — melodies feel settled on these tones.",
  1: "Away from home. Soft tension; great for pre-chorus or ii–V motion.",
  2: "Color chord. Shares tones with I; sweet for pop progressions.",
  3: "Subdominant. Opens the door; pairs with V for a classic cadence.",
  4: "Dominant. Strong pull back to I — the classic “resolve me” chord.",
  5: "Relative minor/major feel. Emotional without leaving the key.",
  6: "Leading-tone / diminished color. Points hard toward I.",
};

/**
 * Build diatonic triads (and V7 / i7 where the scale supports them) for a key.
 * Pentatonic / blues use a reduced set from the implied parent mode.
 */
export function diatonicChords(rootPc: PitchClass, scaleId: ScaleId): DiatonicChord[] {
  const root = normalizePc(rootPc);

  // Expand pentatonics / blues to a parent heptatonic for chord tones
  let chordScale = scaleId;
  if (scaleId === "majorPentatonic") chordScale = "major";
  if (scaleId === "minorPentatonic" || scaleId === "blues") chordScale = "naturalMinor";
  const chordIntervals = getScale(chordScale).intervals;
  if (chordIntervals.length < 7) {
    return [];
  }

  const pcs = chordIntervals.map((i) => normalizePc(root + i));
  const out: DiatonicChord[] = [];

  for (let d = 0; d < 7; d++) {
    const r = pcs[d]!;
    const third = pcs[(d + 2) % 7]!;
    const fifth = pcs[(d + 4) % 7]!;
    const quality = triadQuality(r, third, fifth);
    const roman = romanFor(chordScale, d, quality);
    out.push({
      degree: d,
      roman,
      name: `${roman} (${qualityLabel(quality)})`,
      quality,
      pitchClasses: [r, third, fifth],
      blurb: ROLE_BLURBS[d] ?? "Diatonic chord in this key.",
    });
  }

  // Add V7 for major-family and harmonic minor
  const addDom7 =
    chordScale === "major" ||
    chordScale === "mixolydian" ||
    chordScale === "harmonicMinor" ||
    scaleId === "major" ||
    scaleId === "mixolydian" ||
    scaleId === "harmonicMinor" ||
    scaleId === "majorPentatonic";

  if (addDom7) {
    const d = 4;
    const r = pcs[d]!;
    const third = pcs[(d + 2) % 7]!;
    const fifth = pcs[(d + 4) % 7]!;
    const seventh = pcs[(d + 6) % 7]!;
    out.push({
      degree: 4,
      roman: "V7",
      name: "V7 (dominant 7)",
      quality: "dom7",
      pitchClasses: [r, third, fifth, seventh],
      blurb: "Adds the flat-seventh for a stronger pull to I — the classic cadence fuel.",
    });
  }

  return out;
}

export function chordMidis(chord: DiatonicChord, lo?: number, hi?: number): number[] {
  return midisForPitchClasses(chord.pitchClasses, lo, hi);
}
