import { emptyChecklist, type SongSection } from "./document";

export interface SongFormSectionDef {
  id: string;
  label: string;
  bars: number;
  prompt: string;
}

export interface SongFormPreset {
  id: string;
  name: string;
  description: string;
  sections: SongFormSectionDef[];
}

const PROMPTS = {
  intro: "Set the mood. Hint the groove or a fragment of the hook without stating it fully.",
  verse: "Tell the story. Keep the melody conversational; leave room for lyrics.",
  chorus: "State the hook. Make the melody memorable and the harmony feel like “home.”",
  bridge: "Contrast. Change harmony, range, or rhythm so the final chorus lands harder.",
  interlude: "Instrumental break. Develop a motif, or give the singer space to breathe.",
  ending: "Resolve. Cadence clearly — tag the hook, ritard, or a short coda.",
  aSection: "A section: establish the main theme.",
  bSection: "B section (bridge): contrast harmony and contour.",
  blues: "12-bar blues cycle. Outline I–IV–V; leave space for fills.",
};

export const SONG_FORM_PRESETS: SongFormPreset[] = [
  {
    id: "pop-standard",
    name: "Pop standard",
    description: "Intro → Verse 1 → Chorus → Verse 2 → Chorus → Bridge → Chorus → Ending",
    sections: [
      { id: "intro", label: "Intro", bars: 4, prompt: PROMPTS.intro },
      { id: "verse1", label: "Verse 1", bars: 8, prompt: PROMPTS.verse },
      { id: "chorus1", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "verse2", label: "Verse 2", bars: 8, prompt: PROMPTS.verse },
      { id: "chorus2", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "bridge", label: "Bridge", bars: 8, prompt: PROMPTS.bridge },
      { id: "chorus3", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "ending", label: "Ending", bars: 4, prompt: PROMPTS.ending },
    ],
  },
  {
    id: "pop-interlude",
    name: "Pop with interlude",
    description: "Intro → Verse 1 → Chorus → Verse 2 → Chorus → Interlude → Chorus → Ending",
    sections: [
      { id: "intro", label: "Intro", bars: 4, prompt: PROMPTS.intro },
      { id: "verse1", label: "Verse 1", bars: 8, prompt: PROMPTS.verse },
      { id: "chorus1", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "verse2", label: "Verse 2", bars: 8, prompt: PROMPTS.verse },
      { id: "chorus2", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "interlude", label: "Interlude", bars: 4, prompt: PROMPTS.interlude },
      { id: "chorus3", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "ending", label: "Ending", bars: 4, prompt: PROMPTS.ending },
    ],
  },
  {
    id: "verse-chorus-short",
    name: "Verse–chorus short",
    description: "Intro → Verse → Chorus → Verse → Chorus → Ending",
    sections: [
      { id: "intro", label: "Intro", bars: 4, prompt: PROMPTS.intro },
      { id: "verse1", label: "Verse", bars: 8, prompt: PROMPTS.verse },
      { id: "chorus1", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "verse2", label: "Verse", bars: 8, prompt: PROMPTS.verse },
      { id: "chorus2", label: "Chorus", bars: 8, prompt: PROMPTS.chorus },
      { id: "ending", label: "Ending", bars: 4, prompt: PROMPTS.ending },
    ],
  },
  {
    id: "aaba",
    name: "AABA",
    description: "Intro → A → A → B → A → Ending",
    sections: [
      { id: "intro", label: "Intro", bars: 4, prompt: PROMPTS.intro },
      { id: "a1", label: "A", bars: 8, prompt: PROMPTS.aSection },
      { id: "a2", label: "A", bars: 8, prompt: PROMPTS.aSection },
      { id: "b", label: "B", bars: 8, prompt: PROMPTS.bSection },
      { id: "a3", label: "A", bars: 8, prompt: PROMPTS.aSection },
      { id: "ending", label: "Ending", bars: 4, prompt: PROMPTS.ending },
    ],
  },
  {
    id: "blues-12",
    name: "12-bar blues",
    description: "Three labeled 12-bar choruses plus optional intro/outro",
    sections: [
      { id: "intro", label: "Intro", bars: 4, prompt: PROMPTS.intro },
      { id: "chorus1", label: "Chorus 1", bars: 12, prompt: PROMPTS.blues },
      { id: "chorus2", label: "Chorus 2", bars: 12, prompt: PROMPTS.blues },
      { id: "chorus3", label: "Chorus 3", bars: 12, prompt: PROMPTS.blues },
      { id: "ending", label: "Ending", bars: 4, prompt: PROMPTS.ending },
    ],
  },
  {
    id: "custom",
    name: "Custom",
    description: "Start empty and add your own sections",
    sections: [
      { id: "section1", label: "Section 1", bars: 8, prompt: "Name this section and sketch what it needs." },
    ],
  },
];

export function presetToSections(preset: SongFormPreset, overrides?: SongFormSectionDef[]): SongSection[] {
  const defs = overrides ?? preset.sections;
  let start = 0;
  return defs.map((d, i) => {
    const sec: SongSection = {
      id: d.id || `sec-${i}`,
      label: d.label,
      startMeasure: start,
      barCount: Math.max(1, d.bars),
      prompt: d.prompt,
      checklist: emptyChecklist(),
    };
    start += sec.barCount;
    return sec;
  });
}

export function cloneFormDefs(preset: SongFormPreset): SongFormSectionDef[] {
  return preset.sections.map((s) => ({ ...s }));
}
