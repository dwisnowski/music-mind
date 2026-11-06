import {
  createBlankDocument,
  createEmptyMeasure,
  emptyChecklist,
  midiToPitch,
  newNoteId,
  type ArticulationId,
  type DynamicId,
  type SongSection,
  type WriteDocument,
  type WriteLyric,
  type WriteMeasure,
  type WriteNote,
  type WritePedalMark,
  type WritePitch,
} from "./document";
import { extractTitleFromXml } from "../score/loadMusicXml";

function pitchFromEl(el: Element): WritePitch | null {
  const pitch = el.querySelector("pitch");
  if (!pitch) return null;
  const step = (pitch.querySelector("step")?.textContent ?? "C") as WritePitch["step"];
  const alter = Number(pitch.querySelector("alter")?.textContent ?? 0);
  const octave = Number(pitch.querySelector("octave")?.textContent ?? 4);
  const stepIndex = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[step] ?? 0;
  const midi = (octave + 1) * 12 + stepIndex + alter;
  return { step, alter, octave, midi };
}

function articulationsFrom(el: Element): ArticulationId[] | undefined {
  const art = el.querySelector("notations articulations");
  if (!art) return undefined;
  const out: ArticulationId[] = [];
  for (const child of art.children) {
    const name = child.tagName as ArticulationId;
    if (["staccato", "accent", "tenuto", "strong-accent"].includes(name)) out.push(name);
  }
  return out.length ? out : undefined;
}

function lyricFrom(el: Element): WriteLyric | undefined {
  const lyric = el.querySelector("lyric");
  if (!lyric) return undefined;
  const text = lyric.querySelector("text")?.textContent?.trim() ?? "";
  if (!text) return undefined;
  const syllabic = (lyric.querySelector("syllabic")?.textContent ?? "single") as WriteLyric["syllabic"];
  return { text, syllabic };
}

/**
 * Import MusicXML into a WriteDocument (grand-staff aware, best-effort).
 */
export function fromMusicXml(xml: string, fileName?: string): WriteDocument {
  const parsed = new DOMParser().parseFromString(xml, "application/xml");
  if (parsed.querySelector("parsererror")) {
    throw new Error("Invalid MusicXML file.");
  }

  const title =
    parsed.querySelector("work-title")?.textContent?.trim() ||
    parsed.querySelector("movement-title")?.textContent?.trim() ||
    extractTitleFromXml(xml, fileName?.replace(/\.(musicxml|xml|mxl)$/i, "") || "Untitled");

  const composer =
    parsed.querySelector('creator[type="composer"]')?.textContent?.trim() ||
    parsed.querySelector("creator")?.textContent?.trim() ||
    "";

  const doc = createBlankDocument({ title, bars: 0 });
  doc.composer = composer;
  doc.measures = [];

  const part = parsed.querySelector("part") ?? parsed.documentElement;
  let divisions = 1;
  let keyFifths = 0;
  let beats = 4;
  let beatType = 4;
  let measureIndex = 0;

  const sections: SongSection[] = [];

  for (const child of part.children) {
    if (child.tagName !== "measure") continue;
    const measure: WriteMeasure = createEmptyMeasure(measureIndex);
    let cursorByVoice = new Map<string, number>();
    let pendingChord: WriteNote | null = null;

    for (const el of child.children) {
      if (el.tagName === "attributes") {
        const div = el.querySelector("divisions");
        if (div?.textContent) divisions = Number(div.textContent) || divisions;
        const fifths = el.querySelector("key fifths");
        if (fifths?.textContent != null) {
          keyFifths = Number(fifths.textContent) || 0;
          if (measureIndex === 0) doc.keyFifths = keyFifths;
          else measure.keyFifths = keyFifths;
        }
        const b = el.querySelector("time beats");
        const bt = el.querySelector("time beat-type");
        if (b?.textContent && bt?.textContent) {
          beats = Number(b.textContent) || beats;
          beatType = Number(bt.textContent) || beatType;
          if (measureIndex === 0) {
            doc.beats = beats;
            doc.beatType = beatType;
          } else {
            measure.beats = beats;
            measure.beatType = beatType;
          }
        }
        continue;
      }

      if (el.tagName === "direction") {
        const rehearsal = el.querySelector("rehearsal")?.textContent?.trim();
        if (rehearsal) {
          measure.rehearsal = rehearsal;
          sections.push({
            id: `sec-${sections.length}`,
            label: rehearsal,
            startMeasure: measureIndex,
            barCount: 1,
            prompt: "",
            checklist: emptyChecklist(),
          });
        }
        const tempo = el.querySelector("sound")?.getAttribute("tempo");
        const perMin = el.querySelector("metronome per-minute")?.textContent;
        if (tempo) doc.bpm = Number(tempo) || doc.bpm;
        else if (perMin) doc.bpm = Number(perMin) || doc.bpm;
        const dynEl = el.querySelector("dynamics");
        if (dynEl) {
          const dynName = [...dynEl.children][0]?.tagName as DynamicId | undefined;
          if (dynName && measure.notes.length) {
            const last = measure.notes[measure.notes.length - 1];
            if (last) last.dynamics = dynName;
          }
        }
        const pedalEl = el.querySelector("pedal");
        if (pedalEl) {
          const pedalType = (pedalEl.getAttribute("type") ?? "start") as WritePedalMark["type"];
          const offsetDiv = Number(el.querySelector("offset")?.textContent ?? 0);
          const onsetQuarters = divisions > 0 ? offsetDiv / divisions : 0;
          measure.pedals = measure.pedals ?? [];
          measure.pedals.push({
            onsetQuarters,
            type: pedalType === "stop" || pedalType === "change" ? pedalType : "start",
            controller: 64,
          });
        }
        continue;
      }

      if (el.tagName === "barline") {
        const repeat = el.querySelector("repeat");
        if (repeat?.getAttribute("direction") === "forward") measure.forwardRepeat = true;
        if (repeat?.getAttribute("direction") === "backward") {
          measure.backwardRepeat = true;
          const times = Number(repeat.getAttribute("times") ?? 2);
          if (times > 0) measure.repeatTimes = times;
        }
        const ending = el.querySelector("ending");
        if (ending) {
          const nums = (ending.getAttribute("number") ?? "")
            .split(",")
            .map((n) => Number(n.trim()))
            .filter((n) => n > 0);
          if (nums.length) measure.volta = nums;
        }
        continue;
      }

      if (el.tagName === "backup") {
        pendingChord = null;
        continue;
      }

      if (el.tagName !== "note") continue;

      const isChord = Boolean(el.querySelector("chord"));
      const isRest = Boolean(el.querySelector("rest"));
      const durationDiv = Number(el.querySelector("duration")?.textContent ?? 0);
      const durationQuarters = divisions > 0 ? durationDiv / divisions : 1;
      const staffIndex = Math.max(0, Number(el.querySelector("staff")?.textContent ?? 1) - 1);
      const voice = Number(el.querySelector("voice")?.textContent ?? (staffIndex === 0 ? 1 : 2));
      const pitch = pitchFromEl(el);
      const beam = el.querySelector("beam")?.textContent as WriteNote["beam"] | undefined;
      const tieEl = el.querySelector("tie");
      const tie = tieEl?.getAttribute("type") === "start"
        ? "start"
        : tieEl?.getAttribute("type") === "stop"
          ? "stop"
          : undefined;
      const timeMod = el.querySelector("time-modification");
      const tupletEl = el.querySelector("notations tuplet");
      let tuplet: WriteNote["tuplet"];
      if (timeMod && tupletEl) {
        tuplet = {
          actual: Number(timeMod.querySelector("actual-notes")?.textContent ?? 3),
          normal: Number(timeMod.querySelector("normal-notes")?.textContent ?? 2),
          place: (tupletEl.getAttribute("type") as "start" | "stop") || "start",
        };
      }

      if (isChord && pendingChord && pitch) {
        pendingChord.pitches.push(pitch);
        continue;
      }

      const soundDyn = el.querySelector("sound")?.getAttribute("dynamics");
      let velocity: number | undefined;
      if (soundDyn != null && soundDyn !== "") {
        const pct = Number(soundDyn);
        if (Number.isFinite(pct)) {
          velocity = Math.max(1, Math.min(127, Math.round((pct / 100) * 90)));
        }
      }

      const note: WriteNote = {
        id: newNoteId(),
        kind: isRest || !pitch ? "rest" : "note",
        pitches: pitch && !isRest ? [pitch] : [],
        durationQuarters,
        staffIndex,
        voice,
        tie,
        lyric: lyricFrom(el),
        articulations: articulationsFrom(el),
        beam: beam === "begin" || beam === "continue" || beam === "end" ? beam : undefined,
        tuplet,
        velocity,
      };

      const vKey = `${staffIndex}:${voice}`;
      cursorByVoice.set(vKey, (cursorByVoice.get(vKey) ?? 0) + durationQuarters);
      measure.notes.push(note);
      pendingChord = note.kind === "note" ? note : null;
    }

    // Prefer chronological-ish order: already push order from XML walk is fine for our editor
    doc.measures.push(measure);
    measureIndex += 1;
  }

  doc.divisions = Math.max(divisions, 16);
  if (!doc.measures.length) {
    doc.measures = [createEmptyMeasure(0)];
  }

  // Merge consecutive same-label sections' bar counts
  if (sections.length) {
    const merged: SongSection[] = [];
    for (const s of sections) {
      const prev = merged[merged.length - 1];
      if (prev && prev.label === s.label && prev.startMeasure + prev.barCount === s.startMeasure) {
        prev.barCount += 1;
      } else {
        merged.push({ ...s });
      }
    }
    // Extend last section bar counts to next section / end
    for (let i = 0; i < merged.length; i++) {
      const cur = merged[i]!;
      const next = merged[i + 1];
      const end = next ? next.startMeasure : doc.measures.length;
      cur.barCount = Math.max(1, end - cur.startMeasure);
    }
    doc.sections = merged;
  }

  // Ensure pitch midi matches step/alter/octave for imported notes
  for (const m of doc.measures) {
    for (const n of m.notes) {
      n.pitches = n.pitches.map((p) => midiToPitch(p.midi));
    }
  }

  return doc;
}
