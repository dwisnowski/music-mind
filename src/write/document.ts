/** Editable score document for Write mode (source of truth). */

export type WriteComplexity = "simple" | "lyrics" | "advanced";

export type DurationId =
  | "1"
  | "1/2"
  | "1/4"
  | "1/8"
  | "1/16"
  | "1."
  | "1/2."
  | "1/4."
  | "1/8.";

export interface WritePitch {
  step: "C" | "D" | "E" | "F" | "G" | "A" | "B";
  alter: number;
  octave: number;
  midi: number;
}

export type ArticulationId =
  | "staccato"
  | "accent"
  | "tenuto"
  | "strong-accent";

export type DynamicId = "pp" | "p" | "mp" | "mf" | "f" | "ff";

export interface WriteLyric {
  text: string;
  syllabic: "single" | "begin" | "middle" | "end";
}

export interface WriteNote {
  id: string;
  kind: "note" | "rest";
  /** Chord tones; empty when kind === "rest". */
  pitches: WritePitch[];
  /** Length in quarter-note units. */
  durationQuarters: number;
  staffIndex: number;
  voice: number;
  tie?: "start" | "stop";
  lyric?: WriteLyric;
  articulations?: ArticulationId[];
  dynamics?: DynamicId;
  /** MIDI velocity 1–127 retained from capture (performance). */
  velocity?: number;
  beam?: "begin" | "continue" | "end";
  /** Tuplet ratio actual:normal (e.g. 3:2). */
  tuplet?: { actual: number; normal: number; place: "start" | "stop" };
}

/** Pedal direction within a measure (MusicXML `<pedal>`). */
export interface WritePedalMark {
  /** Onset within the measure in quarter-notes. */
  onsetQuarters: number;
  type: "start" | "stop" | "change";
  /** MIDI CC: 64 sustain, 66 sostenuto, 67 soft. */
  controller: number;
  value?: number;
}

export interface WriteMeasure {
  index: number;
  /** Notes in chronological order within the measure (all voices/staves). */
  notes: WriteNote[];
  /** Sustain / pedal directions timed within the measure. */
  pedals?: WritePedalMark[];
  rehearsal?: string;
  keyFifths?: number;
  beats?: number;
  beatType?: number;
  pickup?: boolean;
  forwardRepeat?: boolean;
  backwardRepeat?: boolean;
  repeatTimes?: number;
  volta?: number[];
}

export interface SectionChecklist {
  melody: boolean;
  harmony: boolean;
  lyrics: boolean;
  dynamics: boolean;
}

export interface SongSection {
  id: string;
  label: string;
  startMeasure: number;
  barCount: number;
  prompt: string;
  checklist: SectionChecklist;
}

export interface WriteCursor {
  measureIndex: number;
  /** Onset within the measure in quarter-notes. */
  onsetQuarters: number;
  staffIndex: number;
  voice: number;
}

export interface WriteDocument {
  title: string;
  composer: string;
  keyFifths: number;
  beats: number;
  beatType: number;
  bpm: number;
  /** Divisions per quarter for MusicXML (16 = 64th resolution). */
  divisions: number;
  measures: WriteMeasure[];
  sections: SongSection[];
  writeMode: WriteComplexity;
  cursor: WriteCursor;
  selectionId: string | null;
  /** Active duration for step entry. */
  stepDuration: DurationId;
  /** When true, next note starts a tie from previous same pitch. */
  tieNext: boolean;
}

export const DURATION_QUARTERS: Record<DurationId, number> = {
  "1": 4,
  "1/2": 2,
  "1/4": 1,
  "1/8": 0.5,
  "1/16": 0.25,
  "1.": 6,
  "1/2.": 3,
  "1/4.": 1.5,
  "1/8.": 0.75,
};

export const STEP_NAMES = ["C", "D", "E", "F", "G", "A", "B"] as const;

let idCounter = 0;
export function newNoteId(): string {
  idCounter += 1;
  return `n${idCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

export function midiToPitch(midi: number): WritePitch {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const table: { step: WritePitch["step"]; alter: number }[] = [
    { step: "C", alter: 0 },
    { step: "C", alter: 1 },
    { step: "D", alter: 0 },
    { step: "D", alter: 1 },
    { step: "E", alter: 0 },
    { step: "F", alter: 0 },
    { step: "F", alter: 1 },
    { step: "G", alter: 0 },
    { step: "G", alter: 1 },
    { step: "A", alter: 0 },
    { step: "A", alter: 1 },
    { step: "B", alter: 0 },
  ];
  const { step, alter } = table[pc]!;
  return { step, alter, octave, midi };
}

export function defaultStaffForMidi(midi: number): number {
  return midi < 60 ? 1 : 0;
}

export function measureCapacityQuarters(doc: WriteDocument, measureIndex: number): number {
  const m = doc.measures[measureIndex];
  if (!m) return doc.beats * (4 / doc.beatType);
  const beats = m.beats ?? doc.beats;
  const beatType = m.beatType ?? doc.beatType;
  if (m.pickup) return Math.min(beats * (4 / beatType), doc.beats * (4 / doc.beatType));
  return beats * (4 / beatType);
}

export function emptyChecklist(): SectionChecklist {
  return { melody: false, harmony: false, lyrics: false, dynamics: false };
}

export function createEmptyMeasure(index: number, rehearsal?: string): WriteMeasure {
  return {
    index,
    notes: [],
    rehearsal,
  };
}

export function createBlankDocument(opts?: {
  title?: string;
  bars?: number;
  keyFifths?: number;
  beats?: number;
  beatType?: number;
  bpm?: number;
  writeMode?: WriteComplexity;
}): WriteDocument {
  const bars = opts?.bars ?? 4;
  const measures = Array.from({ length: bars }, (_, i) => createEmptyMeasure(i));
  return {
    title: opts?.title ?? "Untitled",
    composer: "",
    keyFifths: opts?.keyFifths ?? 0,
    beats: opts?.beats ?? 4,
    beatType: opts?.beatType ?? 4,
    bpm: opts?.bpm ?? 100,
    divisions: 16,
    measures,
    sections: [],
    writeMode: opts?.writeMode ?? "simple",
    cursor: { measureIndex: 0, onsetQuarters: 0, staffIndex: 0, voice: 1 },
    selectionId: null,
    stepDuration: "1/4",
    tieNext: false,
  };
}

export function cloneDocument(doc: WriteDocument): WriteDocument {
  return structuredClone(doc);
}

export function findNote(doc: WriteDocument, id: string): { measure: WriteMeasure; note: WriteNote; index: number } | null {
  for (const measure of doc.measures) {
    const index = measure.notes.findIndex((n) => n.id === id);
    if (index >= 0) return { measure, note: measure.notes[index]!, index };
  }
  return null;
}

/** Voice onset occupancy within a measure for a staff/voice. */
export function voiceUsedQuarters(
  measure: WriteMeasure,
  staffIndex: number,
  voice: number,
): number {
  let used = 0;
  for (const n of measure.notes) {
    if (n.staffIndex === staffIndex && n.voice === voice) used += n.durationQuarters;
  }
  return used;
}

export function durationTypeAndDots(quarters: number): {
  type: string;
  dots: number;
  durationDivisions: (divisions: number) => number;
} {
  const table: { q: number; type: string; dots: number }[] = [
    { q: 6, type: "whole", dots: 1 },
    { q: 4, type: "whole", dots: 0 },
    { q: 3, type: "half", dots: 1 },
    { q: 2, type: "half", dots: 0 },
    { q: 1.5, type: "quarter", dots: 1 },
    { q: 1, type: "quarter", dots: 0 },
    { q: 0.75, type: "eighth", dots: 1 },
    { q: 0.5, type: "eighth", dots: 0 },
    { q: 0.375, type: "16th", dots: 1 },
    { q: 0.25, type: "16th", dots: 0 },
    { q: 0.125, type: "32nd", dots: 0 },
  ];
  let best = table[table.length - 1]!;
  let bestDiff = Infinity;
  for (const row of table) {
    const d = Math.abs(row.q - quarters);
    if (d < bestDiff) {
      bestDiff = d;
      best = row;
    }
  }
  return {
    type: best.type,
    dots: best.dots,
    durationDivisions: (divisions) => Math.max(1, Math.round(quarters * divisions)),
  };
}
