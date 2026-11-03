export interface SampleScore {
  id: string;
  title: string;
  composer: string;
  path: string;
}

export const SAMPLE_SCORES: SampleScore[] = [
  {
    id: "twinkle",
    title: "Twinkle Twinkle (excerpt)",
    composer: "Traditional",
    path: "/samples/twinkle.musicxml",
  },
  {
    id: "fur-elise",
    title: "Für Elise",
    composer: "Ludwig van Beethoven",
    path: "/samples/fur-elise.mxl",
  },
  {
    id: "clair-de-lune",
    title: "Clair de Lune",
    composer: "Claude Debussy",
    path: "/samples/clair-de-lune.mxl",
  },
];
