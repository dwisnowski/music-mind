import {
  cloneDocument,
  createEmptyMeasure,
  defaultStaffForMidi,
  DURATION_QUARTERS,
  measureCapacityQuarters,
  midiToPitch,
  newNoteId,
  type ArticulationId,
  type DurationId,
  type DynamicId,
  type SongSection,
  type WriteComplexity,
  type WriteDocument,
  type WriteLyric,
  type WriteNote,
} from "./document";

export type WriteCommand =
  | { type: "setMeta"; title?: string; composer?: string; bpm?: number; keyFifths?: number; beats?: number; beatType?: number }
  | { type: "setWriteMode"; writeMode: WriteComplexity }
  | { type: "setStepDuration"; duration: DurationId }
  | { type: "setTieNext"; tieNext: boolean }
  | { type: "setCursor"; measureIndex: number; onsetQuarters?: number; staffIndex?: number; voice?: number }
  | { type: "select"; noteId: string | null }
  | { type: "insertNotes"; midis: number[]; durationQuarters?: number }
  | { type: "insertRest" }
  | { type: "deleteSelection" }
  | { type: "deleteBackward" }
  | { type: "setLyric"; noteId: string; lyric: WriteLyric | undefined }
  | { type: "setArticulations"; noteId: string; articulations: ArticulationId[] }
  | { type: "setDynamics"; noteId: string; dynamics: DynamicId | undefined }
  | { type: "setBeam"; noteId: string; beam: WriteNote["beam"] }
  | { type: "setTuplet"; noteId: string; tuplet: WriteNote["tuplet"] }
  | { type: "setNoteStaff"; noteId: string; staffIndex: number; voice?: number }
  | { type: "togglePickup"; measureIndex: number }
  | { type: "setMeasureRepeat"; measureIndex: number; forward?: boolean; backward?: boolean; times?: number; volta?: number[] }
  | { type: "replaceDocument"; document: WriteDocument }
  | { type: "applySections"; sections: SongSection[]; rebuildMeasures: boolean }
  | { type: "updateSectionChecklist"; sectionId: string; checklist: SongSection["checklist"] }
  | {
      type: "mergeRecorded";
      notes: {
        midis: number[];
        onsetQuarters: number;
        durationQuarters: number;
        staffIndex: number;
      }[];
      fromMeasure: number;
    };

export class WriteCommandStack {
  private past: WriteDocument[] = [];
  private future: WriteDocument[] = [];
  private doc: WriteDocument;
  private listeners = new Set<(doc: WriteDocument) => void>();

  constructor(initial: WriteDocument) {
    this.doc = initial;
  }

  get document(): WriteDocument {
    return this.doc;
  }

  subscribe(fn: (doc: WriteDocument) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.doc);
  }

  private commit(next: WriteDocument) {
    this.past.push(cloneDocument(this.doc));
    if (this.past.length > 100) this.past.shift();
    this.future = [];
    this.doc = next;
    this.emit();
  }

  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(cloneDocument(this.doc));
    this.doc = prev;
    this.emit();
  }

  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(cloneDocument(this.doc));
    this.doc = next;
    this.emit();
  }

  canUndo() {
    return this.past.length > 0;
  }

  canRedo() {
    return this.future.length > 0;
  }

  dispatch(cmd: WriteCommand) {
    const next = applyCommand(cloneDocument(this.doc), cmd);
    this.commit(next);
  }

  /** Replace without stacking history (e.g. load draft). */
  load(doc: WriteDocument) {
    this.past = [];
    this.future = [];
    this.doc = doc;
    this.emit();
  }
}

function advanceCursor(doc: WriteDocument, byQuarters: number) {
  let { measureIndex, onsetQuarters } = doc.cursor;
  onsetQuarters += byQuarters;
  while (measureIndex < doc.measures.length) {
    const cap = measureCapacityQuarters(doc, measureIndex);
    if (onsetQuarters < cap - 1e-9) break;
    onsetQuarters -= cap;
    measureIndex += 1;
    if (measureIndex >= doc.measures.length) {
      doc.measures.push(createEmptyMeasure(doc.measures.length));
    }
  }
  if (measureIndex >= doc.measures.length) {
    doc.measures.push(createEmptyMeasure(doc.measures.length));
  }
  doc.cursor.measureIndex = measureIndex;
  doc.cursor.onsetQuarters = Math.max(0, onsetQuarters);
}

function insertAtCursor(doc: WriteDocument, note: WriteNote) {
  // Spill into following measures if the current bar is full for this staff/voice.
  let remaining = note.durationQuarters;
  let firstId: string | null = null;
  while (remaining > 1e-9) {
    if (doc.cursor.measureIndex >= doc.measures.length) {
      doc.measures.push(createEmptyMeasure(doc.measures.length));
    }
    const m = doc.measures[doc.cursor.measureIndex]!;
    const cap = measureCapacityQuarters(doc, doc.cursor.measureIndex);
    const used = m.notes
      .filter((n) => n.staffIndex === note.staffIndex && n.voice === note.voice)
      .reduce((s, n) => s + n.durationQuarters, 0);
    const room = Math.max(0, cap - used);
    if (room <= 1e-9) {
      doc.cursor.measureIndex += 1;
      doc.cursor.onsetQuarters = 0;
      if (doc.cursor.measureIndex >= doc.measures.length) {
        doc.measures.push(createEmptyMeasure(doc.measures.length));
      }
      continue;
    }
    const slice = Math.min(remaining, room);
    const piece: WriteNote = {
      ...note,
      id: firstId ? newNoteId() : note.id,
      durationQuarters: slice,
      tie:
        remaining > slice + 1e-9
          ? "start"
          : note.tie === "start"
            ? "start"
            : remaining < note.durationQuarters
              ? "stop"
              : note.tie,
      // Only keep lyric/dynamics on the first slice
      lyric: firstId ? undefined : note.lyric,
      dynamics: firstId ? undefined : note.dynamics,
    };
    if (!firstId) firstId = piece.id;
    m.notes.push(piece);
    remaining -= slice;
    if (remaining > 1e-9) {
      doc.cursor.measureIndex += 1;
      doc.cursor.onsetQuarters = 0;
    } else {
      advanceCursor(doc, 0);
      doc.cursor.onsetQuarters = used + slice;
      if (doc.cursor.onsetQuarters >= cap - 1e-9) {
        doc.cursor.measureIndex += 1;
        doc.cursor.onsetQuarters = 0;
        if (doc.cursor.measureIndex >= doc.measures.length) {
          doc.measures.push(createEmptyMeasure(doc.measures.length));
        }
      }
    }
  }
  doc.selectionId = firstId ?? note.id;
}

export function applyCommand(doc: WriteDocument, cmd: WriteCommand): WriteDocument {
  switch (cmd.type) {
    case "setMeta": {
      if (cmd.title != null) doc.title = cmd.title;
      if (cmd.composer != null) doc.composer = cmd.composer;
      if (cmd.bpm != null) doc.bpm = cmd.bpm;
      if (cmd.keyFifths != null) doc.keyFifths = cmd.keyFifths;
      if (cmd.beats != null) doc.beats = cmd.beats;
      if (cmd.beatType != null) doc.beatType = cmd.beatType;
      return doc;
    }
    case "setWriteMode":
      doc.writeMode = cmd.writeMode;
      return doc;
    case "setStepDuration":
      doc.stepDuration = cmd.duration;
      return doc;
    case "setTieNext":
      doc.tieNext = cmd.tieNext;
      return doc;
    case "setCursor":
      doc.cursor.measureIndex = Math.max(0, Math.min(cmd.measureIndex, doc.measures.length - 1));
      if (cmd.onsetQuarters != null) doc.cursor.onsetQuarters = Math.max(0, cmd.onsetQuarters);
      if (cmd.staffIndex != null) doc.cursor.staffIndex = cmd.staffIndex;
      if (cmd.voice != null) doc.cursor.voice = cmd.voice;
      return doc;
    case "select":
      doc.selectionId = cmd.noteId;
      return doc;
    case "insertNotes": {
      const duration = cmd.durationQuarters ?? DURATION_QUARTERS[doc.stepDuration];
      const midis = [...cmd.midis].sort((a, b) => a - b);
      if (!midis.length) return doc;
      // Prefer staff of first note; chords stay on one staff (cursor staff or heuristic)
      const primary = midis[Math.floor(midis.length / 2)]!;
      const staffIndex = defaultStaffForMidi(primary);
      const voice = staffIndex === 0 ? 1 : 2;
      doc.cursor.staffIndex = staffIndex;
      doc.cursor.voice = voice;
      const note: WriteNote = {
        id: newNoteId(),
        kind: "note",
        pitches: midis.map(midiToPitch),
        durationQuarters: duration,
        staffIndex,
        voice,
        tie: doc.tieNext ? "start" : undefined,
      };
      doc.tieNext = false;
      insertAtCursor(doc, note);
      return doc;
    }
    case "insertRest": {
      const duration = DURATION_QUARTERS[doc.stepDuration];
      const staffIndex = doc.cursor.staffIndex;
      const voice = doc.cursor.voice || (staffIndex === 0 ? 1 : 2);
      insertAtCursor(doc, {
        id: newNoteId(),
        kind: "rest",
        pitches: [],
        durationQuarters: duration,
        staffIndex,
        voice,
      });
      return doc;
    }
    case "deleteSelection": {
      if (!doc.selectionId) return doc;
      for (const m of doc.measures) {
        const i = m.notes.findIndex((n) => n.id === doc.selectionId);
        if (i >= 0) {
          m.notes.splice(i, 1);
          doc.selectionId = null;
          break;
        }
      }
      return doc;
    }
    case "deleteBackward": {
      const m = doc.measures[doc.cursor.measureIndex];
      if (!m) return doc;
      const staffNotes = m.notes.filter(
        (n) => n.staffIndex === doc.cursor.staffIndex && n.voice === doc.cursor.voice,
      );
      const last = staffNotes[staffNotes.length - 1];
      if (!last) {
        if (doc.cursor.measureIndex > 0 && doc.cursor.onsetQuarters <= 0) {
          doc.cursor.measureIndex -= 1;
          doc.cursor.onsetQuarters = measureCapacityQuarters(doc, doc.cursor.measureIndex);
        }
        return doc;
      }
      const idx = m.notes.findIndex((n) => n.id === last.id);
      if (idx >= 0) m.notes.splice(idx, 1);
      doc.cursor.onsetQuarters = Math.max(0, doc.cursor.onsetQuarters - last.durationQuarters);
      doc.selectionId = null;
      return doc;
    }
    case "setLyric": {
      for (const m of doc.measures) {
        const n = m.notes.find((x) => x.id === cmd.noteId);
        if (n) {
          n.lyric = cmd.lyric;
          break;
        }
      }
      return doc;
    }
    case "setArticulations": {
      for (const m of doc.measures) {
        const n = m.notes.find((x) => x.id === cmd.noteId);
        if (n) {
          n.articulations = cmd.articulations.length ? cmd.articulations : undefined;
          break;
        }
      }
      return doc;
    }
    case "setDynamics": {
      for (const m of doc.measures) {
        const n = m.notes.find((x) => x.id === cmd.noteId);
        if (n) {
          n.dynamics = cmd.dynamics;
          break;
        }
      }
      return doc;
    }
    case "setBeam": {
      for (const m of doc.measures) {
        const n = m.notes.find((x) => x.id === cmd.noteId);
        if (n) {
          n.beam = cmd.beam;
          break;
        }
      }
      return doc;
    }
    case "setTuplet": {
      for (const m of doc.measures) {
        const n = m.notes.find((x) => x.id === cmd.noteId);
        if (n) {
          n.tuplet = cmd.tuplet;
          break;
        }
      }
      return doc;
    }
    case "setNoteStaff": {
      for (const m of doc.measures) {
        const n = m.notes.find((x) => x.id === cmd.noteId);
        if (n) {
          n.staffIndex = cmd.staffIndex;
          if (cmd.voice != null) n.voice = cmd.voice;
          else n.voice = cmd.staffIndex === 0 ? 1 : 2;
          break;
        }
      }
      return doc;
    }
    case "togglePickup": {
      const m = doc.measures[cmd.measureIndex];
      if (m) m.pickup = !m.pickup;
      return doc;
    }
    case "setMeasureRepeat": {
      const m = doc.measures[cmd.measureIndex];
      if (!m) return doc;
      if (cmd.forward != null) m.forwardRepeat = cmd.forward;
      if (cmd.backward != null) m.backwardRepeat = cmd.backward;
      if (cmd.times != null) m.repeatTimes = cmd.times;
      if (cmd.volta) m.volta = cmd.volta;
      return doc;
    }
    case "replaceDocument":
      return cloneDocument(cmd.document);
    case "applySections": {
      doc.sections = cmd.sections.map((s) => ({ ...s, checklist: { ...s.checklist } }));
      if (cmd.rebuildMeasures) {
        const measures = [];
        let idx = 0;
        for (const sec of doc.sections) {
          for (let b = 0; b < sec.barCount; b++) {
            const m = createEmptyMeasure(idx, b === 0 ? sec.label : undefined);
            measures.push(m);
            idx += 1;
          }
        }
        doc.measures = measures.length ? measures : [createEmptyMeasure(0)];
        let cursor = 0;
        for (const sec of doc.sections) {
          sec.startMeasure = cursor;
          cursor += sec.barCount;
        }
        doc.cursor = { measureIndex: 0, onsetQuarters: 0, staffIndex: 0, voice: 1 };
        doc.selectionId = null;
      } else {
        // Stamp rehearsal marks onto existing measures
        for (const sec of doc.sections) {
          const m = doc.measures[sec.startMeasure];
          if (m) m.rehearsal = sec.label;
        }
      }
      return doc;
    }
    case "updateSectionChecklist": {
      const sec = doc.sections.find((s) => s.id === cmd.sectionId);
      if (sec) sec.checklist = { ...cmd.checklist };
      return doc;
    }
    case "mergeRecorded": {
      let measureIndex = cmd.fromMeasure;
      const byMeasure = new Map<number, WriteNote[]>();
      for (const r of cmd.notes) {
        let mi = cmd.fromMeasure;
        let onset = r.onsetQuarters;
        while (mi < doc.measures.length) {
          const cap = measureCapacityQuarters(doc, mi);
          if (onset < cap - 1e-9) break;
          onset -= cap;
          mi += 1;
          if (mi >= doc.measures.length) doc.measures.push(createEmptyMeasure(mi));
        }
        if (mi >= doc.measures.length) doc.measures.push(createEmptyMeasure(mi));
        const list = byMeasure.get(mi) ?? [];
        list.push({
          id: newNoteId(),
          kind: "note",
          pitches: r.midis.map(midiToPitch),
          durationQuarters: r.durationQuarters,
          staffIndex: r.staffIndex,
          voice: r.staffIndex === 0 ? 1 : 2,
        });
        byMeasure.set(mi, list);
        measureIndex = Math.max(measureIndex, mi);
      }
      for (const [mi, notes] of byMeasure) {
        const m = doc.measures[mi];
        if (!m) continue;
        m.notes.push(...notes);
      }
      doc.cursor.measureIndex = measureIndex;
      return doc;
    }
    default:
      return doc;
  }
}
