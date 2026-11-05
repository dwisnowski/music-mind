import type { SampleScore } from "./samples";

const README_URL =
  "https://raw.githubusercontent.com/musetrainer/library/master/README.md";
const CACHE_KEY = "mm.museTrainerLibrary";

/** README list line: `- Title &middot; [Play](...) &middot; [Download](url)` */
const LIST_LINE =
  /^-\s+(.+?)\s+(?:&middot;|·)\s+\[Play\]\([^)]+\)\s+(?:&middot;|·)\s+\[Download\]\((https:\/\/musetrainer\.github\.io\/library\/scores\/[^)]+\.mxl)\)/i;

function decodeEntities(text: string): string {
  return text
    .replace(/&middot;/gi, "·")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function idFromUrl(url: string): string {
  const file = url.split("/").pop() ?? url;
  return file.replace(/\.mxl$/i, "");
}

export function parseMuseTrainerReadme(markdown: string): SampleScore[] {
  const scores: SampleScore[] = [];
  const seen = new Set<string>();

  for (const line of markdown.split(/\r?\n/)) {
    const match = LIST_LINE.exec(line.trim());
    if (!match) continue;
    const title = decodeEntities(match[1].trim());
    const path = match[2].trim();
    const id = idFromUrl(path);
    if (!title || !id || seen.has(id)) continue;
    seen.add(id);
    scores.push({
      id: `mt-${id}`,
      title,
      composer: "MuseTrainer library",
      path,
    });
  }

  return scores;
}

function readCache(): SampleScore[] | null {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SampleScore[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(scores: SampleScore[]): void {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(scores));
  } catch {
    /* quota / private mode */
  }
}

export async function fetchMuseTrainerLibrary(): Promise<SampleScore[]> {
  const cached = readCache();
  if (cached) return cached;

  const res = await fetch(README_URL);
  if (!res.ok) {
    throw new Error(`Could not load MuseTrainer catalog (${res.status}).`);
  }
  const markdown = await res.text();
  const scores = parseMuseTrainerReadme(markdown);
  if (scores.length === 0) {
    throw new Error("MuseTrainer catalog was empty or unreadable.");
  }
  writeCache(scores);
  return scores;
}
