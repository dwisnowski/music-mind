import type { SampleScore } from "./samples";

/** Personal scores gated by Cloudflare Access + Worker allowlist (ADR 0018). */
export const PRIVATE_SAMPLE_SCORES: SampleScore[] = [
  {
    id: "private-girl-rush",
    title: "Girl Rush",
    composer: "Personal",
    path: "/samples/private/girl-rush.musicxml",
  },
  {
    id: "private-mad-world",
    title: "Mad World",
    composer: "Personal",
    path: "/samples/private/mad-world.musicxml",
  },
  {
    id: "private-moonlight-sonata",
    title: "Moonlight Sonata (theme)",
    composer: "L. van Beethoven",
    path: "/samples/private/moonlight-sonata.musicxml",
  },
  {
    id: "private-gymnopedie-no1",
    title: "Gymnopédie No. 1 (fingered)",
    composer: "Erik Satie",
    path: "/samples/private/gymnopedie-no1.musicxml",
  },
  {
    id: "private-love-story",
    title: "Love Story",
    composer: "Personal",
    path: "/samples/private/love-story.musicxml",
  },
  {
    id: "private-beat-it",
    title: "Beat It",
    composer: "Personal",
    path: "/samples/private/beat-it.musicxml",
  },
  {
    id: "private-without-me",
    title: "Without Me",
    composer: "Personal",
    path: "/samples/private/without-me.musicxml",
  },
  {
    id: "private-carol-of-the-bells",
    title: "Carol of the Bells",
    composer: "Personal",
    path: "/samples/private/carol-of-the-bells.musicxml",
  },
  {
    id: "private-canon-in-d",
    title: "Canon in D",
    composer: "J. Pachelbel",
    path: "/samples/private/canon-in-d.musicxml",
  },
  {
    id: "private-im-good-blue",
    title: "I'm Good (Blue)",
    composer: "Personal",
    path: "/samples/private/im-good-blue.musicxml",
  },
  {
    id: "private-bohemian-rhapsody",
    title: "Bohemian Rhapsody",
    composer: "Personal",
    path: "/samples/private/bohemian-rhapsody.musicxml",
  },
];

export function isPrivateSamplePath(path: string): boolean {
  return path.startsWith("/samples/private/");
}
