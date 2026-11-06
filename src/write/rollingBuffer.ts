import type { RawCaptureEvent, RawCcEvent, RawNoteEvent } from "./quantize";

export interface AbsoluteMidiEvent {
  /** performance.now() milliseconds */
  absMs: number;
  event: RawCaptureEvent;
}

const DEFAULT_CAPACITY_MS = 60_000;

/**
 * Ring buffer of recent MIDI note + pedal events while Write is open.
 */
export class RollingMidiBuffer {
  private events: AbsoluteMidiEvent[] = [];
  private capacityMs: number;

  constructor(capacityMs = DEFAULT_CAPACITY_MS) {
    this.capacityMs = Math.max(5_000, capacityMs);
  }

  clear() {
    this.events = [];
  }

  pushNote(
    type: "on" | "off",
    midi: number,
    velocity?: number,
    absMs: number = performance.now(),
  ) {
    const event: RawNoteEvent = {
      kind: "note",
      midi,
      type,
      t: 0,
      velocity: type === "on" ? clampVelocity(velocity) : velocity,
    };
    this.events.push({ absMs, event });
    this.trim(absMs);
  }

  pushCc(controller: number, value: number, absMs: number = performance.now()) {
    const event: RawCcEvent = {
      kind: "cc",
      controller,
      value: Math.max(0, Math.min(127, Math.round(value))),
      t: 0,
    };
    this.events.push({ absMs, event });
    this.trim(absMs);
  }

  /** Events in the last `sec` seconds, re-zeroed so first event is near t=0. */
  sliceLast(sec: number, nowMs: number = performance.now()): RawCaptureEvent[] {
    const from = nowMs - Math.max(0.05, sec) * 1000;
    return this.sliceAbs(from, nowMs);
  }

  sliceAbs(fromMs: number, toMs: number): RawCaptureEvent[] {
    const slice = this.events.filter((e) => e.absMs >= fromMs && e.absMs <= toMs);
    if (!slice.length) return [];
    const origin = slice[0]!.absMs;
    return correctPedalAtStart(
      slice.map(({ absMs, event }) => ({
        ...event,
        t: Math.max(0, (absMs - origin) / 1000),
      })),
      this.events,
      fromMs,
    );
  }

  private trim(nowMs: number) {
    const cutoff = nowMs - this.capacityMs;
    while (this.events.length && this.events[0]!.absMs < cutoff) {
      this.events.shift();
    }
  }
}

function clampVelocity(v: number | undefined): number {
  if (v == null || !Number.isFinite(v)) return 80;
  return Math.max(1, Math.min(127, Math.round(v)));
}

/**
 * If a pedal was held before the window, inject a synthetic CC at t=0 so trim/audition stay correct.
 */
function correctPedalAtStart(
  relative: RawCaptureEvent[],
  all: AbsoluteMidiEvent[],
  fromMs: number,
): RawCaptureEvent[] {
  const controllers = [64, 66, 67];
  const inject: RawCcEvent[] = [];
  for (const controller of controllers) {
    let last: number | null = null;
    for (const e of all) {
      if (e.absMs >= fromMs) break;
      if (e.event.kind === "cc" && e.event.controller === controller) {
        last = e.event.value;
      }
    }
    if (last != null && last >= 64) {
      const already = relative.some(
        (r) => r.kind === "cc" && r.controller === controller && r.t < 0.02,
      );
      if (!already) {
        inject.push({ kind: "cc", controller, value: last, t: 0 });
      }
    }
  }
  return [...inject, ...relative].sort((a, b) => a.t - b.t);
}

export const DOCK_DEFAULT_VELOCITY = 80;
