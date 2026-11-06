import type { GenreId } from "../theory/genres";
import type { ScaleId } from "../theory/scales";
import type { PitchClass } from "../theory/pitch";

export type FreePracticePlayMode = "free" | "guided";

export type TheoryTab = "chords" | "intervals" | "circle";

export interface FreePracticeSelection {
  genreId: GenreId;
  rootPc: PitchClass;
  scaleId: ScaleId;
  playMode: FreePracticePlayMode;
  /** Selected diatonic chord degree key: `${degree}-${roman}` or null. */
  chordKey: string | null;
  riffId: string | null;
  theoryTab: TheoryTab;
}
