import type { LoadedScore, ScoreEvent, ScoreNote } from "./types";
import { extractTitleFromXml } from "./loadMusicXml";

interface MeasureNote {
  midi: number;
  staffIndex: number;
  /** Onset relative to measure start, in quarter-notes. */
  relativeOnset: number;
  duration: number;
}

interface ParsedMeasure {
  index: number;
  duration: number;
  notes: MeasureNote[];
  forwardRepeat: boolean;
  backwardRepeat: boolean;
  /** Total plays of the repeated section (MusicXML default 2). */
  repeatTimes: number;
  /** Volta numbers for this measure, or null if not under an ending. */
  endingNumbers: number[] | null;
}

/**
 * Lightweight MusicXML pitch timeline for practice matching.
 * Groups notes that share the same onset (chord) into ScoreEvents.
 * Expands repeat/volta barlines into playback order so Listen and Feedback
 * follow the same path as OSMD's cursor iterator.
 */
export function parseMusicXmlTimeline(xml: string, fileName?: string): LoadedScore {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) {
    throw new Error("Invalid MusicXML file.");
  }

  const title =
    doc.querySelector("work-title")?.textContent?.trim() ||
    doc.querySelector("movement-title")?.textContent?.trim() ||
    extractTitleFromXml(xml, fileName?.replace(/\.(musicxml|xml|mxl)$/i, "") || "Untitled");

  const parts = [...doc.querySelectorAll("part")];
  const measures = new Map<number, ParsedMeasure>();

  for (const part of parts.length ? parts : [doc.documentElement]) {
    let measureIndex = 0;
    let divisions = 1;
    let openEndings: number[] | null = null;

    for (const child of part.children) {
      if (child.tagName === "attributes" || child.querySelector?.("divisions")) {
        const div = child.querySelector?.("divisions") ?? (child.tagName === "divisions" ? child : null);
        if (div?.textContent) divisions = Number(div.textContent) || divisions;
      }

      if (child.tagName !== "measure") continue;
      const idx = measureIndex;
      measureIndex += 1;

      let measure = measures.get(idx);
      if (!measure) {
        measure = {
          index: idx,
          duration: 0,
          notes: [],
          forwardRepeat: false,
          backwardRepeat: false,
          repeatTimes: 2,
          endingNumbers: null,
        };
        measures.set(idx, measure);
      }

      let cursor = 0;
      let measureEndings = openEndings;

      for (const el of child.children) {
        if (el.tagName === "attributes") {
          const div = el.querySelector("divisions");
          if (div?.textContent) divisions = Number(div.textContent) || divisions;
          continue;
        }

        if (el.tagName === "barline") {
          const location = el.getAttribute("location") ?? "right";
          const repeat = el.querySelector("repeat");
          if (repeat) {
            const direction = repeat.getAttribute("direction");
            if (direction === "forward") {
              measure.forwardRepeat = true;
              // MuseScore often omits ending stop before a new forward-repeat section.
              if (location === "left") {
                openEndings = null;
                measureEndings = null;
              }
            }
            if (direction === "backward") {
              measure.backwardRepeat = true;
              const times = Number(repeat.getAttribute("times") ?? 2);
              if (times > 0) measure.repeatTimes = times;
            }
          }
          for (const ending of el.querySelectorAll("ending")) {
            const nums = parseEndingNumbers(ending.getAttribute("number"));
            const type = ending.getAttribute("type");
            if (type === "start") {
              openEndings = nums;
              measureEndings = nums;
            } else if (type === "stop" || type === "discontinue") {
              if (location === "left") {
                // Ending ends before this measure's content.
                openEndings = null;
                measureEndings = null;
              } else {
                // Ending includes this measure, then closes.
                measureEndings = nums.length ? nums : measureEndings;
                openEndings = null;
              }
            }
          }
          continue;
        }

        if (el.tagName === "backup") {
          const dur = Number(el.querySelector("duration")?.textContent ?? 0);
          cursor -= dur / divisions;
          continue;
        }

        if (el.tagName === "forward") {
          const dur = Number(el.querySelector("duration")?.textContent ?? 0);
          cursor += dur / divisions;
          continue;
        }

        if (el.tagName !== "note") continue;

        const isChord = Boolean(el.querySelector("chord"));
        const isRest = Boolean(el.querySelector("rest"));
        const isGrace = Boolean(el.querySelector("grace"));
        const durationDivs = Number(el.querySelector("duration")?.textContent ?? 0);
        const duration = durationDivs / divisions;
        const staffIndex = Math.max(0, Number(el.querySelector("staff")?.textContent ?? 1) - 1);
        const onset = cursor;

        if (!isRest && !isGrace) {
          const pitch = el.querySelector("pitch");
          if (pitch) {
            const step = pitch.querySelector("step")?.textContent ?? "C";
            const alter = Number(pitch.querySelector("alter")?.textContent ?? 0);
            const octave = Number(pitch.querySelector("octave")?.textContent ?? 4);
            const midi = stepOctaveToMidi(step, alter, octave);
            const tieStop = [...el.querySelectorAll("tie")].some((t) => t.getAttribute("type") === "stop");
            const tiedStop = [...el.querySelectorAll("tied")].some((t) => t.getAttribute("type") === "stop");
            if (!tieStop && !tiedStop) {
              measure.notes.push({
                midi,
                staffIndex,
                relativeOnset: onset,
                duration,
              });
            }
          }
        }

        if (!isChord && !isGrace) {
          cursor += duration;
        }
      }

      measure.endingNumbers = measureEndings;
      measure.duration = Math.max(measure.duration, cursor);
    }
  }

  const ordered = [...measures.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, m]) => m);

  const expandedNotes = expandRepeats(ordered);

  expandedNotes.sort(
    (a, b) => a.timestamp - b.timestamp || a.staffIndex - b.staffIndex || a.midi - b.midi,
  );

  const events: ScoreEvent[] = [];
  const EPS = 1e-6;
  for (const note of expandedNotes) {
    const last = events[events.length - 1];
    if (last && Math.abs(last.timestamp - note.timestamp) <= EPS) {
      if (!last.notes.some((n) => n.midi === note.midi)) {
        last.notes.push(note);
      }
    } else {
      events.push({ index: events.length, timestamp: note.timestamp, notes: [note] });
    }
  }

  return { title, events, xml };
}

/** Expand forward/backward repeats and voltas into playback order with enrolled time. */
function expandRepeats(measures: ParsedMeasure[]): ScoreNote[] {
  if (measures.length === 0) return [];

  const notes: ScoreNote[] = [];
  const passByStart = new Map<number, number>();
  let enrolled = 0;
  let i = 0;
  let guard = 0;
  const maxSteps = measures.length * 8 + 64;

  while (i < measures.length && guard++ < maxSteps) {
    const measure = measures[i];
    const start = findRepeatStart(measures, i);
    if (measure.forwardRepeat && !passByStart.has(i)) {
      passByStart.set(i, 1);
    }
    const pass = passByStart.get(start) ?? 1;
    const playable = isPlayableEnding(measure.endingNumbers, pass);

    if (playable) {
      for (const n of measure.notes) {
        notes.push({
          midi: n.midi,
          staffIndex: n.staffIndex,
          measureIndex: measure.index,
          timestamp: enrolled + n.relativeOnset,
          duration: n.duration,
          osmdNote: null,
        });
      }
      enrolled += measure.duration;
    }

    if (measure.backwardRepeat) {
      const times = Math.max(2, measure.repeatTimes || 2);
      if (playable && pass < times) {
        passByStart.set(start, pass + 1);
        i = start;
        continue;
      }
      // Finished this repeat region (final pass played, or volta skipped the repeat bar).
      passByStart.set(start, 1);
    }

    i += 1;
  }

  return notes;
}

function findRepeatStart(measures: ParsedMeasure[], index: number): number {
  for (let j = index; j >= 0; j--) {
    if (measures[j].forwardRepeat) return j;
  }
  return 0;
}

function isPlayableEnding(endingNumbers: number[] | null, pass: number): boolean {
  if (!endingNumbers || endingNumbers.length === 0) return true;
  return endingNumbers.includes(pass);
}

function parseEndingNumbers(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
}

function stepOctaveToMidi(step: string, alter: number, octave: number): number {
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = (base[step.toUpperCase()] ?? 0) + alter;
  return (octave + 1) * 12 + pc;
}
