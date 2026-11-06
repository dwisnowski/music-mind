import {
  durationTypeAndDots,
  type WriteDocument,
  type WriteMeasure,
  type WriteNote,
} from "./document";

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function noteXml(note: WriteNote, divisions: number, isChordTone: boolean): string {
  const { type, dots, durationDivisions } = durationTypeAndDots(note.durationQuarters);
  const dur = durationDivisions(divisions);
  const parts: string[] = ["      <note>"];
  if (isChordTone) parts.push("        <chord/>");
  if (note.kind === "rest") {
    parts.push("        <rest/>");
  } else {
    const pitch = note.pitches[0];
    if (pitch) {
      parts.push("        <pitch>");
      parts.push(`          <step>${pitch.step}</step>`);
      if (pitch.alter) parts.push(`          <alter>${pitch.alter}</alter>`);
      parts.push(`          <octave>${pitch.octave}</octave>`);
      parts.push("        </pitch>");
    }
  }
  parts.push(`        <duration>${dur}</duration>`);
  if (note.tie === "start") {
    parts.push(`        <tie type="start"/>`);
  } else if (note.tie === "stop") {
    parts.push(`        <tie type="stop"/>`);
  }
  parts.push(`        <voice>${note.voice}</voice>`);
  parts.push(`        <type>${type}</type>`);
  for (let i = 0; i < dots; i++) parts.push("        <dot/>");
  if (note.tuplet) {
    parts.push("        <time-modification>");
    parts.push(`          <actual-notes>${note.tuplet.actual}</actual-notes>`);
    parts.push(`          <normal-notes>${note.tuplet.normal}</normal-notes>`);
    parts.push("        </time-modification>");
  }
  if (note.beam) parts.push(`        <beam number="1">${note.beam}</beam>`);
  parts.push(`        <staff>${note.staffIndex + 1}</staff>`);
  const notations: string[] = [];
  if (note.tie === "start") notations.push(`          <tied type="start"/>`);
  if (note.tie === "stop") notations.push(`          <tied type="stop"/>`);
  if (note.articulations?.length) {
    notations.push("          <articulations>");
    for (const a of note.articulations) {
      notations.push(`            <${a}/>`);
    }
    notations.push("          </articulations>");
  }
  if (note.tuplet) {
    notations.push(
      `          <tuplet type="${note.tuplet.place}" number="1"/>`,
    );
  }
  if (notations.length) {
    parts.push("        <notations>");
    parts.push(...notations);
    parts.push("        </notations>");
  }
  if (note.lyric?.text) {
    parts.push("        <lyric number=\"1\">");
    parts.push(`          <syllabic>${note.lyric.syllabic}</syllabic>`);
    parts.push(`          <text>${esc(note.lyric.text)}</text>`);
    parts.push("        </lyric>");
  }
  // MusicXML sound/@dynamics ≈ percent of forte (MIDI 90). Preserve numeric velocity.
  if (note.velocity != null && note.velocity > 0) {
    const dynPct = Math.max(1, Math.min(200, Math.round((note.velocity / 90) * 100)));
    parts.push(`        <sound dynamics="${dynPct}"/>`);
  }
  parts.push("      </note>");
  return parts.join("\n");
}

function emitNoteGroup(note: WriteNote, divisions: number): string {
  if (note.kind === "rest" || note.pitches.length <= 1) {
    return noteXml(note, divisions, false);
  }
  const lines: string[] = [];
  for (let i = 0; i < note.pitches.length; i++) {
    const tone: WriteNote = {
      ...note,
      pitches: [note.pitches[i]!],
    };
    lines.push(noteXml(tone, divisions, i > 0));
  }
  return lines.join("\n");
}

function measureXml(measure: WriteMeasure, doc: WriteDocument, isFirst: boolean): string {
  const lines: string[] = [`    <measure number="${measure.index + 1}">`];

  if (measure.forwardRepeat) {
    lines.push(`      <barline location="left">`);
    lines.push(`        <bar-style>heavy-light</bar-style>`);
    lines.push(`        <repeat direction="forward"/>`);
    lines.push(`      </barline>`);
  }

  if (isFirst || measure.keyFifths != null || measure.beats != null || measure.pickup) {
    lines.push("      <attributes>");
    if (isFirst) {
      lines.push(`        <divisions>${doc.divisions}</divisions>`);
      lines.push("        <key>");
      lines.push(`          <fifths>${measure.keyFifths ?? doc.keyFifths}</fifths>`);
      lines.push("        </key>");
      lines.push("        <time>");
      lines.push(`          <beats>${measure.beats ?? doc.beats}</beats>`);
      lines.push(`          <beat-type>${measure.beatType ?? doc.beatType}</beat-type>`);
      lines.push("        </time>");
      lines.push("        <staves>2</staves>");
      lines.push('        <clef number="1">');
      lines.push("          <sign>G</sign>");
      lines.push("          <line>2</line>");
      lines.push("        </clef>");
      lines.push('        <clef number="2">');
      lines.push("          <sign>F</sign>");
      lines.push("          <line>4</line>");
      lines.push("        </clef>");
    } else {
      if (measure.keyFifths != null) {
        lines.push("        <key>");
        lines.push(`          <fifths>${measure.keyFifths}</fifths>`);
        lines.push("        </key>");
      }
      if (measure.beats != null && measure.beatType != null) {
        lines.push("        <time>");
        lines.push(`          <beats>${measure.beats}</beats>`);
        lines.push(`          <beat-type>${measure.beatType}</beat-type>`);
        lines.push("        </time>");
      }
    }
    lines.push("      </attributes>");
  }

  if (isFirst) {
    lines.push("      <direction placement=\"above\">");
    lines.push("        <direction-type>");
    lines.push(`          <metronome parentheses="no">`);
    lines.push("            <beat-unit>quarter</beat-unit>");
    lines.push(`            <per-minute>${doc.bpm}</per-minute>`);
    lines.push("          </metronome>");
    lines.push("        </direction-type>");
    lines.push("        <sound tempo=\"" + doc.bpm + "\"/>");
    lines.push("      </direction>");
  }

  if (measure.rehearsal) {
    lines.push('      <direction placement="above">');
    lines.push("        <direction-type>");
    lines.push(`          <rehearsal>${esc(measure.rehearsal)}</rehearsal>`);
    lines.push("        </direction-type>");
    lines.push("      </direction>");
  }

  // Pedal directions at measure onset (approximate; OSMD may show sustain marks).
  if (measure.pedals?.length) {
    const sorted = [...measure.pedals].sort((a, b) => a.onsetQuarters - b.onsetQuarters);
    for (const p of sorted) {
      const pedalType = p.type === "change" ? "change" : p.type;
      lines.push('      <direction placement="below">');
      lines.push("        <direction-type>");
      lines.push(`          <pedal type="${pedalType}" line="yes"/>`);
      lines.push("        </direction-type>");
      if (p.onsetQuarters > 0) {
        const div = Math.max(0, Math.round(p.onsetQuarters * doc.divisions));
        lines.push(`        <offset>${div}</offset>`);
      }
      lines.push("      </direction>");
    }
  }

  // Emit notes staff-by-staff with backups so both staves share the measure.
  const treble = measure.notes.filter((n) => n.staffIndex === 0);
  const bass = measure.notes.filter((n) => n.staffIndex === 1);

  const emitVoice = (notes: WriteNote[]) => {
    let lastDynamics: string | undefined;
    for (const n of notes) {
      if (n.dynamics && n.dynamics !== lastDynamics) {
        lines.push('      <direction placement="below">');
        lines.push("        <direction-type>");
        lines.push(`          <dynamics><${n.dynamics}/></dynamics>`);
        lines.push("        </direction-type>");
        lines.push("      </direction>");
        lastDynamics = n.dynamics;
      }
      lines.push(emitNoteGroup(n, doc.divisions));
    }
  };

  emitVoice(treble);

  const trebleDur = treble.reduce((s, n) => s + n.durationQuarters, 0);
  const bassDur = bass.reduce((s, n) => s + n.durationQuarters, 0);
  const backupQuarters = trebleDur || measureCapacity(doc, measure);
  if (bass.length || treble.length) {
    const backupDiv = Math.max(1, Math.round(backupQuarters * doc.divisions));
    lines.push("      <backup>");
    lines.push(`        <duration>${backupDiv}</duration>`);
    lines.push("      </backup>");
  }

  emitVoice(bass);

  // Pad empty staves with whole-measure rests so OSMD always has content.
  if (!treble.length && !bass.length) {
    const cap = measureCapacity(doc, measure);
    const rest: WriteNote = {
      id: "pad",
      kind: "rest",
      pitches: [],
      durationQuarters: cap,
      staffIndex: 0,
      voice: 1,
    };
    lines.push(emitNoteGroup(rest, doc.divisions));
    const backupDiv = Math.max(1, Math.round(cap * doc.divisions));
    lines.push("      <backup>");
    lines.push(`        <duration>${backupDiv}</duration>`);
    lines.push("      </backup>");
    lines.push(
      emitNoteGroup({ ...rest, staffIndex: 1, voice: 2 }, doc.divisions),
    );
  } else if (!bass.length && treble.length) {
    // Already backed up; add full-measure rest on bass if needed for display
    const cap = Math.max(bassDur, measureCapacity(doc, measure));
    if (bassDur === 0) {
      lines.push(
        emitNoteGroup(
          {
            id: "pad-bass",
            kind: "rest",
            pitches: [],
            durationQuarters: cap,
            staffIndex: 1,
            voice: 2,
          },
          doc.divisions,
        ),
      );
    }
  } else if (!treble.length && bass.length) {
    // treble was empty — emit rest first was skipped; fix by prepending conceptually
    // Already emitted backup from 0; restructure: if only bass, still OK for OSMD
  }

  if (measure.backwardRepeat || measure.volta?.length) {
    lines.push(`      <barline location="right">`);
    if (measure.volta?.length) {
      lines.push(`        <ending number="${measure.volta.join(",")}" type="stop"/>`);
    }
    if (measure.backwardRepeat) {
      lines.push(`        <bar-style>light-heavy</bar-style>`);
      lines.push(
        `        <repeat direction="backward"${measure.repeatTimes && measure.repeatTimes !== 2 ? ` times="${measure.repeatTimes}"` : ""}/>`,
      );
    }
    lines.push(`      </barline>`);
  }

  lines.push("    </measure>");
  return lines.join("\n");
}

function measureCapacity(doc: WriteDocument, measure: WriteMeasure): number {
  const beats = measure.beats ?? doc.beats;
  const beatType = measure.beatType ?? doc.beatType;
  return beats * (4 / beatType);
}

export function toMusicXml(doc: WriteDocument): string {
  const measures = doc.measures.map((m, i) => measureXml(m, doc, i === 0)).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <work>
    <work-title>${esc(doc.title || "Untitled")}</work-title>
  </work>
  <identification>
    <creator type="composer">${esc(doc.composer || "")}</creator>
    <encoding>
      <software>Music Mind Write</software>
    </encoding>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Piano</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${measures}
  </part>
</score-partwise>
`;
}
