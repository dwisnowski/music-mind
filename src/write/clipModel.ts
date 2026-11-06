import type { RawCaptureEvent } from "./quantize";
import { normalizeCaptureEvents } from "./quantize";

export interface WriteClip {
  id: string;
  name: string;
  createdAt: number;
  bpm: number;
  gridQuarters: number;
  /** Full take events (relative seconds from origin). */
  events: RawCaptureEvent[];
  trimStartSec: number;
  trimEndSec: number;
}

export function newClipId(): string {
  return crypto.randomUUID?.() ?? `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createClip(opts: {
  name?: string;
  bpm: number;
  gridQuarters: number;
  events: RawCaptureEvent[];
}): WriteClip {
  const events = normalizeCaptureEvents(opts.events);
  const end = events.length ? Math.max(...events.map((e) => e.t)) + 0.05 : 0;
  return {
    id: newClipId(),
    name: opts.name ?? defaultClipName(),
    createdAt: Date.now(),
    bpm: opts.bpm,
    gridQuarters: opts.gridQuarters,
    events,
    trimStartSec: 0,
    trimEndSec: Math.max(0.1, end),
  };
}

function defaultClipName(): string {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Riff ${hh}:${mm}`;
}

/** Events inside the trim window, re-zeroed; pedal state corrected at start. */
export function trimmedClipEvents(clip: WriteClip): RawCaptureEvent[] {
  const start = Math.max(0, clip.trimStartSec);
  const end = Math.max(start + 0.05, clip.trimEndSec);
  const windowed = clip.events.filter((e) => e.t >= start && e.t <= end);
  const relative = windowed.map((e) => ({ ...e, t: Math.max(0, e.t - start) }));

  const controllers = [64, 66, 67];
  const inject: RawCaptureEvent[] = [];
  for (const controller of controllers) {
    let last: number | null = null;
    for (const e of clip.events) {
      if (e.t >= start) break;
      if (e.kind === "cc" && e.controller === controller) last = e.value;
    }
    if (last != null && last >= 64) {
      inject.push({ kind: "cc", controller, value: last, t: 0 });
    }
  }
  return [...inject, ...relative].sort((a, b) => a.t - b.t);
}

export function clipDurationSec(clip: WriteClip): number {
  return Math.max(0, clip.trimEndSec - clip.trimStartSec);
}

/** Onset-ordered unique-ish pitch sequence for Free Practice Guided. */
export function clipToMidiSequence(clip: WriteClip): number[] {
  const events = trimmedClipEvents(clip);
  const midis: number[] = [];
  for (const e of events) {
    if (e.kind === "note" && e.type === "on") midis.push(e.midi);
  }
  return midis;
}
