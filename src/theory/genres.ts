import type { ScaleId } from "./scales";

export type GenreId = "blues" | "pop" | "edm" | "country" | "classical";

export interface GenreDef {
  id: GenreId;
  name: string;
  blurb: string;
  defaultScale: ScaleId;
  /** Alternate scales that fit the genre well. */
  scales: readonly ScaleId[];
  riffIds: readonly string[];
}

export const GENRES: readonly GenreDef[] = [
  {
    id: "blues",
    name: "Blues",
    blurb: "Blue notes and call-and-response. Stick to the blues or minor pentatonic and lean on I–IV–V.",
    defaultScale: "blues",
    scales: ["blues", "minorPentatonic", "mixolydian", "major"],
    riffIds: ["blues-turnaround", "blues-shuffle", "blues-call"],
  },
  {
    id: "pop",
    name: "Pop",
    blurb: "Catchy hooks over I–V–vi–IV. Major and major pentatonic keep melodies singable.",
    defaultScale: "major",
    scales: ["major", "majorPentatonic", "naturalMinor", "mixolydian"],
    riffIds: ["pop-hook", "pop-lift", "pop-resolve"],
  },
  {
    id: "edm",
    name: "EDM",
    blurb: "Minor drive and repeating motifs. Phrygian or harmonic minor add clubby tension.",
    defaultScale: "naturalMinor",
    scales: ["naturalMinor", "phrygian", "harmonicMinor", "minorPentatonic"],
    riffIds: ["edm-ostinato", "edm-rise", "edm-drop"],
  },
  {
    id: "country",
    name: "Country",
    blurb: "Major pentatonic runs and mixolydian twang. Keep lines bright and stepwise.",
    defaultScale: "majorPentatonic",
    scales: ["majorPentatonic", "major", "mixolydian", "blues"],
    riffIds: ["country-run", "country-lick", "country-tag"],
  },
  {
    id: "classical",
    name: "Classical",
    blurb: "Scalar sequences and clear cadences. Major / harmonic minor outline phrase shapes.",
    defaultScale: "major",
    scales: ["major", "harmonicMinor", "naturalMinor", "dorian"],
    riffIds: ["classical-sequence", "classical-cadence", "classical-turn"],
  },
];

const BY_ID = new Map(GENRES.map((g) => [g.id, g]));

export function getGenre(id: GenreId): GenreDef {
  return BY_ID.get(id) ?? GENRES[0]!;
}
