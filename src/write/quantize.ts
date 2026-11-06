import { defaultStaffForMidi } from "./document";

export interface RawNoteEvent {
  kind: "note";
  midi: number;
  type: "on" | "off";
  /** Seconds from capture/clip origin. */
  t: number;
  /** Note-on velocity 1–127; optional on note-off. */
  velocity?: number;
}

export interface RawCcEvent {
  kind: "cc";
  controller: number;
  value: number;
  t: number;
}

/** Timed capture event — notes or pedal/controller. */
export type RawCaptureEvent = RawNoteEvent | RawCcEvent;

/** @deprecated Prefer RawNoteEvent; kept for narrow note-only call sites. */
export type RawNoteCapture = Omit<RawNoteEvent, "kind"> & { kind?: "note" };

export interface QuantizedNote {
  midi: number;
  onsetQuarters: number;
  durationQuarters: number;
  staffIndex: number;
  velocity?: number;
}

export interface QuantizedPedal {
  onsetQuarters: number;
  controller: number;
  /** start when value >= 64, stop when value < 64, else change */
  type: "start" | "stop" | "change";
  value: number;
}

export interface QuantizeOptions {
  bpm: number;
  /** Grid in quarter-notes (0.25 = 16th). */
  gridQuarters: number;
  /** Chord grace window in seconds. */
  chordGraceSec?: number;
}

export function asNoteEvents(events: RawCaptureEvent[]): RawNoteEvent[] {
  return normalizeCaptureEvents(events).filter((e): e is RawNoteEvent => e.kind === "note");
}

/** Normalize legacy note-only events (no `kind`) into RawCaptureEvent[]. */
export function normalizeCaptureEvents(
  events: Array<RawCaptureEvent | { midi: number; type: "on" | "off"; t: number; velocity?: number }>,
): RawCaptureEvent[] {
  return events.map((e) => {
    if ("kind" in e && (e.kind === "cc" || e.kind === "note")) return e as RawCaptureEvent;
    const n = e as { midi: number; type: "on" | "off"; t: number; velocity?: number };
    return { kind: "note" as const, midi: n.midi, type: n.type, t: n.t, velocity: n.velocity };
  });
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

  const noteEvents = asNoteEvents(normalizeCaptureEvents(events));
  const ons = new Map<number, { t: number; velocity?: number }>();
  const pairs: { midi: number; on: number; off: number; velocity?: number }[] = [];

  const sorted = [...noteEvents].sort((a, b) => a.t - b.t || (a.type === "on" ? -1 : 1));
  for (const ev of sorted) {
    if (ev.type === "on") {
      ons.set(ev.midi, { t: ev.t, velocity: ev.velocity });
    } else {
      const on = ons.get(ev.midi);
      if (on == null) continue;
      ons.delete(ev.midi);
      pairs.push({
        midi: ev.midi,
        on: on.t,
        off: Math.max(on.t + 0.05, ev.t),
        velocity: on.velocity,
      });
    }
  }
  const endT = sorted.length ? sorted[sorted.length - 1]!.t + 0.25 : 0;
  for (const [midi, on] of ons) {
    pairs.push({ midi, on: on.t, off: endT, velocity: on.velocity });
  }

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
        velocity: n.velocity,
      });
    }
  }

  const grouped = new Map<string, QuantizedNote[]>();
  for (const n of out) {
    const key = `${n.onsetQuarters}:${n.staffIndex}`;
    const list = grouped.get(key) ?? [];
    list.push(n);
    grouped.set(key, list);
  }

  const merged: QuantizedNote[] = [];
  for (const group of grouped.values()) {
    if (group.length === 1) {
      merged.push(group[0]!);
      continue;
    }
    const maxDur = Math.max(...group.map((g) => g.durationQuarters));
    for (const g of group) {
      merged.push({ ...g, durationQuarters: maxDur });
    }
  }

  return merged.sort((a, b) => a.onsetQuarters - b.onsetQuarters || a.midi - b.midi);
}

/** Map pedal CC events onto the same quarter-note timeline as quantized notes. */
export function quantizePedals(
  events: RawCaptureEvent[],
  options: Pick<QuantizeOptions, "bpm" | "gridQuarters">,
): QuantizedPedal[] {
  const secPerQuarter = 60 / Math.max(1, options.bpm);
  const snap = (quarters: number) =>
    Math.max(0, Math.round(quarters / options.gridQuarters) * options.gridQuarters);

  const out: QuantizedPedal[] = [];
  for (const ev of normalizeCaptureEvents(events)) {
    if (ev.kind !== "cc") continue;
    if (ev.controller !== 64 && ev.controller !== 66 && ev.controller !== 67) continue;
    const type: QuantizedPedal["type"] =
      ev.value >= 64 ? "start" : ev.value === 0 ? "stop" : "change";
    // Binary pedals: treat mid values as start (>=64) or stop (<64)
    const binaryType: QuantizedPedal["type"] = ev.value >= 64 ? "start" : "stop";
    out.push({
      onsetQuarters: snap(ev.t / secPerQuarter),
      controller: ev.controller,
      type: ev.controller === 64 ? binaryType : type,
      value: ev.value,
    });
  }
  return out.sort((a, b) => a.onsetQuarters - b.onsetQuarters);
}

/** Merge quantized notes that share onset+staff into chord-friendly rows for mergeRecorded. */
export function collapseChords(notes: QuantizedNote[]): {
  midis: number[];
  onsetQuarters: number;
  durationQuarters: number;
  staffIndex: number;
  velocity?: number;
}[] {
  const map = new Map<
    string,
    {
      midis: number[];
      onsetQuarters: number;
      durationQuarters: number;
      staffIndex: number;
      velocity?: number;
    }
  >();
  for (const n of notes) {
    const key = `${n.onsetQuarters}:${n.staffIndex}`;
    const cur = map.get(key);
    if (cur) {
      cur.midis.push(n.midi);
      cur.durationQuarters = Math.max(cur.durationQuarters, n.durationQuarters);
      if (n.velocity != null) {
        cur.velocity =
          cur.velocity == null ? n.velocity : Math.max(cur.velocity, n.velocity);
      }
    } else {
      map.set(key, {
        midis: [n.midi],
        onsetQuarters: n.onsetQuarters,
        durationQuarters: n.durationQuarters,
        staffIndex: n.staffIndex,
        velocity: n.velocity,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.onsetQuarters - b.onsetQuarters);
}

/** Map MIDI velocity 1–127 onto Write dynamics bands (optional printed marking). */
export function velocityToDynamics(
  velocity: number | undefined,
): "pp" | "p" | "mp" | "mf" | "f" | "ff" | undefined {
  if (velocity == null || !Number.isFinite(velocity)) return undefined;
  const v = Math.max(1, Math.min(127, Math.round(velocity)));
  if (v < 24) return "pp";
  if (v < 40) return "p";
  if (v < 56) return "mp";
  if (v < 72) return "mf";
  if (v < 96) return "f";
  return "ff";
}
