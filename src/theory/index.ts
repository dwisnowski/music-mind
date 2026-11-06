export {
  FREE_WINDOW_HIGH,
  FREE_WINDOW_LOW,
  midisForPitchClasses,
  midiToPc,
  normalizePc,
  pcName,
  PC_NAMES,
  type PitchClass,
} from "./pitch";

export {
  SCALES,
  buildScaleMidis,
  degreesToMidis,
  getScale,
  nearestMidiForPc,
  scalePitchClasses,
  type ScaleDef,
  type ScaleId,
} from "./scales";

export { chordMidis, diatonicChords, type ChordQuality, type DiatonicChord } from "./chords";

export { classifyHeld, classifyPair, type Consonance, type HeldAnalysis, type IntervalInfo } from "./intervals";

export { CIRCLE_FIFTHS, circleView, type CircleNeighbor, type CircleView } from "./circleOfFifths";

export { GENRES, getGenre, type GenreDef, type GenreId } from "./genres";

export {
  RIFFS,
  getRiff,
  resolveRiffMidis,
  riffsForGenre,
  type RiffDef,
} from "./riffs";
