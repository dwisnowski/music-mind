import {
  measureCapacityQuarters,
  type WriteDocument,
  type WriteNote,
} from "./document";

/** Flattened write-note with absolute onset for hit-testing and range select. */
export interface OrderedWriteNote {
  id: string;
  note: WriteNote;
  measureIndex: number;
  /** Absolute onset in quarter-notes from score start. */
  absoluteOnset: number;
  /** Onset within the measure for this staff/voice. */
  onsetInMeasure: number;
}

/**
 * Document order for selection ranges: measure → staff → voice onset → pitch.
 * Onset is tracked per staff/voice so treble/bass remain independent.
 */
export function listOrderedWriteNotes(doc: WriteDocument): OrderedWriteNote[] {
  const out: OrderedWriteNote[] = [];
  let measureAbs = 0;

  for (let mi = 0; mi < doc.measures.length; mi++) {
    const measure = doc.measures[mi]!;
    const onsetByVoice = new Map<string, number>();
    const inMeasure: OrderedWriteNote[] = [];

    for (const note of measure.notes) {
      const key = `${note.staffIndex}:${note.voice}`;
      const onsetInMeasure = onsetByVoice.get(key) ?? 0;
      inMeasure.push({
        id: note.id,
        note,
        measureIndex: mi,
        absoluteOnset: measureAbs + onsetInMeasure,
        onsetInMeasure,
      });
      onsetByVoice.set(key, onsetInMeasure + note.durationQuarters);
    }

    inMeasure.sort((a, b) => {
      if (a.absoluteOnset !== b.absoluteOnset) return a.absoluteOnset - b.absoluteOnset;
      if (a.note.staffIndex !== b.note.staffIndex) return a.note.staffIndex - b.note.staffIndex;
      const aMidi = a.note.pitches[0]?.midi ?? -1;
      const bMidi = b.note.pitches[0]?.midi ?? -1;
      return aMidi - bMidi;
    });
    out.push(...inMeasure);
    measureAbs += measureCapacityQuarters(doc, mi);
  }

  return out;
}

/** OSMD halfTone may equal MIDI or MIDI−12 depending on build; try both. */
export function midiCandidatesFromOsmd(halfTone: number | null): number[] {
  if (halfTone == null || !Number.isFinite(halfTone)) return [];
  const round = Math.round(halfTone);
  return [...new Set([round, round + 12, round - 12])].filter((m) => m >= 0 && m <= 127);
}

function pitchMatches(entry: OrderedWriteNote, midi: number | null): boolean {
  if (midi == null) return entry.note.kind === "rest" || entry.note.pitches.length === 0;
  if (entry.note.kind === "rest") return false;
  const candidates = midiCandidatesFromOsmd(midi);
  return entry.note.pitches.some((p) => candidates.includes(p.midi) || p.midi === midi);
}

/** Match a click (absolute quarters + midi + staff) to the nearest write-note id. */
export function findWriteNoteIdAt(
  ordered: OrderedWriteNote[],
  absoluteOnset: number,
  midi: number | null,
  staffIndex: number | null,
): string | null {
  if (!ordered.length) return null;

  let best: OrderedWriteNote | null = null;
  let bestScore = Infinity;

  for (const entry of ordered) {
    const onsetDist = Math.abs(entry.absoluteOnset - absoluteOnset);
    if (onsetDist > 0.6) continue;

    let score = onsetDist;
    if (staffIndex != null && entry.note.staffIndex !== staffIndex) score += 0.35;

    if (midi != null && entry.note.kind === "note") {
      if (!pitchMatches(entry, midi)) score += 2;
      else score -= 0.5;
    } else if (midi != null && entry.note.kind === "rest") {
      score += 1.5;
    }

    if (score < bestScore) {
      bestScore = score;
      best = entry;
    }
  }

  if (best) return best.id;

  // Fallback: nearest onset only
  let nearest = ordered[0]!;
  let nearestDist = Math.abs(nearest.absoluteOnset - absoluteOnset);
  for (const entry of ordered) {
    const d = Math.abs(entry.absoluteOnset - absoluteOnset);
    if (d < nearestDist) {
      nearest = entry;
      nearestDist = d;
    }
  }
  return nearest.id;
}

/** Whether a graphical note hit belongs to any of the selected write-notes. */
export function writeNoteIsSelected(
  ordered: OrderedWriteNote[],
  selectedIds: ReadonlySet<string>,
  absoluteOnset: number,
  midi: number | null,
  staffIndex: number | null,
): boolean {
  if (!selectedIds.size) return false;
  for (const entry of ordered) {
    if (!selectedIds.has(entry.id)) continue;
    if (Math.abs(entry.absoluteOnset - absoluteOnset) > 0.35) continue;
    if (staffIndex != null && entry.note.staffIndex !== staffIndex) continue;
    if (entry.note.kind === "rest") {
      if (midi == null || entry.note.pitches.length === 0) return true;
      continue;
    }
    if (pitchMatches(entry, midi)) return true;
    // Chord / staff-matched rest fallback when pitch is unknown
    if (midi == null) return true;
  }
  return false;
}

export function rangeSelectIds(
  ordered: OrderedWriteNote[],
  fromId: string,
  toId: string,
): string[] {
  const a = ordered.findIndex((n) => n.id === fromId);
  const b = ordered.findIndex((n) => n.id === toId);
  if (a < 0 && b < 0) return [];
  if (a < 0) return [toId];
  if (b < 0) return [fromId];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return ordered.slice(lo, hi + 1).map((n) => n.id);
}
