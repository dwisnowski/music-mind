import type { GenreId } from "./genres";
import { degreesToMidis, type ScaleId } from "./scales";
import type { PitchClass } from "./pitch";

export interface RiffDef {
  id: string;
  name: string;
  genre: GenreId;
  /** Preferred scale when the riff is selected (may match genre default). */
  scaleId: ScaleId;
  description: string;
  /**
   * Absolute scale-degree indices (0 = tonic in the starting octave).
   * Degree N = tonic one octave up where N is the scale length.
   */
  degrees: readonly number[];
}

export const RIFFS: readonly RiffDef[] = [
  // Blues (blues scale: 0 1 2 3 4 5 — 6 tones)
  {
    id: "blues-turnaround",
    name: "Turnaround",
    genre: "blues",
    scaleId: "blues",
    description: "Classic descending turnaround into the tonic.",
    degrees: [4, 3, 2, 1, 0],
  },
  {
    id: "blues-shuffle",
    name: "Shuffle motif",
    genre: "blues",
    scaleId: "blues",
    description: "Short shuffle figure with the blue note.",
    degrees: [0, 2, 3, 2, 4, 2, 0],
  },
  {
    id: "blues-call",
    name: "Call phrase",
    genre: "blues",
    scaleId: "minorPentatonic",
    description: "Call-and-response opener on minor pentatonic.",
    degrees: [0, 1, 2, 1, 0, 2, 3],
  },

  // Pop (major: 7 tones)
  {
    id: "pop-hook",
    name: "Hook outline",
    genre: "pop",
    scaleId: "majorPentatonic",
    description: "Singable ascending hook shape.",
    degrees: [0, 1, 2, 3, 2, 1, 0],
  },
  {
    id: "pop-lift",
    name: "Chorus lift",
    genre: "pop",
    scaleId: "major",
    description: "Leap up then settle — chorus energy.",
    degrees: [0, 2, 4, 7, 6, 4],
  },
  {
    id: "pop-resolve",
    name: "Resolve home",
    genre: "pop",
    scaleId: "major",
    description: "Stepwise walk down to tonic.",
    degrees: [5, 4, 3, 2, 1, 0],
  },

  // EDM
  {
    id: "edm-ostinato",
    name: "Ostinato",
    genre: "edm",
    scaleId: "naturalMinor",
    description: "Repeating minor motif for a groove bed.",
    degrees: [0, 2, 3, 2, 0, 2, 3, 5],
  },
  {
    id: "edm-rise",
    name: "Build rise",
    genre: "edm",
    scaleId: "harmonicMinor",
    description: "Rising tension into a drop.",
    degrees: [0, 1, 2, 3, 4, 5, 6, 7],
  },
  {
    id: "edm-drop",
    name: "Drop figure",
    genre: "edm",
    scaleId: "phrygian",
    description: "Phrygian snap for a dark drop.",
    degrees: [4, 0, 1, 0, 3, 0],
  },

  // Country
  {
    id: "country-run",
    name: "Pentatonic run",
    genre: "country",
    scaleId: "majorPentatonic",
    description: "Bright major-pentatonic chicken-pickin' shape.",
    degrees: [0, 1, 2, 3, 4, 3, 2, 1, 0],
  },
  {
    id: "country-lick",
    name: "Twang lick",
    genre: "country",
    scaleId: "mixolydian",
    description: "Mixolydian lick with a flat-7 flavor.",
    degrees: [0, 1, 2, 6, 5, 4, 0],
  },
  {
    id: "country-tag",
    name: "Ending tag",
    genre: "country",
    scaleId: "majorPentatonic",
    description: "Short tag that lands on tonic.",
    degrees: [2, 1, 0, 1, 0],
  },

  // Classical
  {
    id: "classical-sequence",
    name: "Sequence",
    genre: "classical",
    scaleId: "major",
    description: "Descending sequence fragment.",
    degrees: [7, 5, 4, 2, 5, 3, 2, 0],
  },
  {
    id: "classical-cadence",
    name: "Cadence outline",
    genre: "classical",
    scaleId: "major",
    description: "Melodic outline of a V–I cadence.",
    degrees: [4, 6, 7, 4, 2, 0],
  },
  {
    id: "classical-turn",
    name: "Melodic turn",
    genre: "classical",
    scaleId: "harmonicMinor",
    description: "Ornamental turn around the tonic.",
    degrees: [1, 0, 6, 0, 1, 2, 0],
  },
];

const BY_ID = new Map(RIFFS.map((r) => [r.id, r]));

export function getRiff(id: string): RiffDef | undefined {
  return BY_ID.get(id);
}

export function riffsForGenre(genre: GenreId): RiffDef[] {
  return RIFFS.filter((r) => r.genre === genre);
}

export function resolveRiffMidis(
  riff: RiffDef,
  rootPc: PitchClass,
  scaleId?: ScaleId,
  startMidi = 60,
): number[] {
  return degreesToMidis(rootPc, scaleId ?? riff.scaleId, riff.degrees, startMidi);
}
