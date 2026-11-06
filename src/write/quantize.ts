import { defaultStaffForMidi } from "./document";

export interface RawCaptureEvent {
  midi: number;
  type: "on" | "off";
  /** Seconds from capture start. */
  t: number;
}

export interface QuantizedNote {
  midi: number;
  onsetQuarters: number;
  durationQuarters: number;
  staffIndex: number;
}

export interface QuantizeOptions {
  bpm: number;
  /** Grid in quarter-notes (0.25 = 16th). */
  gridQuarters: number;
  /** Chord grace window in seconds. */
  chordGraceSec?: number;
}

/**
 * Convert timed note on/off events into quantized score notes relative to t=0.
 */
export function quantizeCapture(
  events: RawCaptureEvent[],
  options: QuantizeOptions,
): QuantizedNote[] {
  const { bpm, gridQuarters } = options;
  const chordGraceSec = options.chordGraceSec ?? 0.04;
  const secPerQuarter = 60 / Math.max(1, bpm);

  const ons = new Map<number, number>(); // midi -> t
  const pairs: { midi: number; on: number; off: number }[] = [];

  const sorted = [...events].sort((a, b) => a.t - b.t || (a.type === "on" ? -1 : 1));
  for (const ev of sorted) {
    if (ev.type === "on") {
      ons.set(ev.midi, ev.t);
    } else {
      const on = ons.get(ev.midi);
      if (on == null) continue;
      ons.delete(ev.midi);
      pairs.push({ midi: ev.midi, on, off: Math.max(on + 0.05, ev.t) });
    }
  }
  // Notes still held at end: close at last event time + small pad
  const endT = sorted.length ? sorted[sorted.length - 1]!.t + 0.25 : 0;
  for (const [midi, on] of ons) {
    pairs.push({ midi, on, off: endT });
  }

  // Cluster chord onsets
  pairs.sort((a, b) => a.on - b.on);
  const clusters: { on: number; notes: typeof pairs }[] = [];
  for (const p of pairs) {
    const last = clusters[clusters.length - 1];
    if (last && Math.abs(p.on - last.on) <= chordGraceSec) {
      last.notes.push(p);
      last.on = Math.min(last.on, p.on);
    } else {
      clusters.push({ on: p.on, notes: [p] });
    }
  }

  const snap = (quarters: number) =>
    Math.max(0, Math.round(quarters / gridQuarters) * gridQuarters);

  const out: QuantizedNote[] = [];
  for (const cluster of clusters) {
    const onsetQuarters = snap(cluster.on / secPerQuarter);
    for (const n of cluster.notes) {
      const rawDur = (n.off - cluster.on) / secPerQuarter;
      const durationQuarters = Math.max(gridQuarters, snap(rawDur) || gridQuarters);
      out.push({
        midi: n.midi,
        onsetQuarters,
        durationQuarters,
        staffIndex: defaultStaffForMidi(n.midi),
      });
    }
  }

  // Merge same onset+midi duplicates; merge chord pitches later in commands
  // Combine same onset+staff into chords by grouping
  const grouped = new Map<string, QuantizedNote[]>();
  for (const n of out) {
    const key = `${n.onsetQuarters}:${n.staffIndex}`;
    const list = grouped.get(key) ?? [];
    list.push(n);
    grouped.set(key, list);
  }

  const merged: QuantizedNote[] = [];
  for (const group of grouped.values()) {
    // Keep separate notes; WriteCommand mergeRecorded creates one note each —
    // for chords, emit one entry per pitch with same onset (commands create separate notes).
    // Better: return individual notes; UI can leave them. Chord display needs same-onset merge in toMusicXml.
    // We'll merge into single chord notes here for cleaner XML:
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }
    // Same onset — keep as separate QuantizedNotes; commands should chord-merge
    // For now push all; mergeRecorded will create separate notes. Improve: return chord midis
    const maxDur = Math.max(...group.map((g) => g.durationQuarters));
    for (const g of group) {
      merged.push({ ...g, durationQuarters: maxDur });
    }
  }

  return merged.sort((a, b) => a.onsetQuarters - b.onsetQuarters || a.midi - b.midi);
}

/** Merge quantized notes that share onset+staff into chord-friendly rows for mergeRecorded. */
export function collapseChords(notes: QuantizedNote[]): {
  midis: number[];
  onsetQuarters: number;
  durationQuarters: number;
  staffIndex: number;
}[] {
  const map = new Map<string, { midis: number[]; onsetQuarters: number; durationQuarters: number; staffIndex: number }>();
  for (const n of notes) {
    const key = `${n.onsetQuarters}:${n.staffIndex}`;
    const cur = map.get(key);
    if (cur) {
      cur.midis.push(n.midi);
      cur.durationQuarters = Math.max(cur.durationQuarters, n.durationQuarters);
    } else {
      map.set(key, {
        midis: [n.midi],
        onsetQuarters: n.onsetQuarters,
        durationQuarters: n.durationQuarters,
        staffIndex: n.staffIndex,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.onsetQuarters - b.onsetQuarters);
}
