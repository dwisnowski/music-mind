import type { LoadedScore, ScoreEvent, ScoreNote } from "./types";
import { extractTitleFromXml } from "./loadMusicXml";

/**
 * Lightweight MusicXML pitch timeline for practice matching.
 * Groups notes that share the same onset (chord) into ScoreEvents.
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
  const rawNotes: ScoreNote[] = [];

  for (const part of parts.length ? parts : [doc.documentElement]) {
    let measureIndex = 0;
    let divisions = 1;
    let currentTime = 0;
    let staffCountHint = 1;

    for (const child of part.children) {
      if (child.tagName === "attributes" || child.querySelector?.("divisions")) {
        const div = child.querySelector?.("divisions") ?? (child.tagName === "divisions" ? child : null);
        if (div?.textContent) divisions = Number(div.textContent) || divisions;
        const staves = child.querySelector?.("staves");
        if (staves?.textContent) staffCountHint = Number(staves.textContent) || staffCountHint;
      }

      if (child.tagName !== "measure") continue;
      measureIndex += 1;
      let measureTime = currentTime;
      // Forward cursor within measure for backup/forward
      let cursor = measureTime;

      for (const el of child.children) {
        if (el.tagName === "attributes") {
          const div = el.querySelector("divisions");
          if (div?.textContent) divisions = Number(div.textContent) || divisions;
          const staves = el.querySelector("staves");
          if (staves?.textContent) staffCountHint = Number(staves.textContent) || staffCountHint;
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

        if (!isChord) {
          // non-chord note advances after we record it at current cursor
        } else {
          // chord shares onset with previous note — cursor already at onset
        }

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
              rawNotes.push({
                midi,
                staffIndex,
                measureIndex: measureIndex - 1,
                timestamp: onset,
                duration,
                osmdNote: null,
              });
            }
          }
        }

        if (!isChord && !isGrace) {
          cursor += duration;
        }
      }

      currentTime = Math.max(currentTime, cursor);
      void staffCountHint;
    }
  }

  rawNotes.sort((a, b) => a.timestamp - b.timestamp || a.staffIndex - b.staffIndex || a.midi - b.midi);

  const events: ScoreEvent[] = [];
  const EPS = 1e-6;
  for (const note of rawNotes) {
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

function stepOctaveToMidi(step: string, alter: number, octave: number): number {
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const pc = (base[step.toUpperCase()] ?? 0) + alter;
  return (octave + 1) * 12 + pc;
}
