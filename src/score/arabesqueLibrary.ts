import type { SampleScore } from "./samples";

const CATALOG_URL = "https://arabesque.app/data/scores.json";
const SCORE_ORIGIN = "https://arabesque.app/";
const CACHE_KEY = "mm.arabesqueLibrary";

interface ArabesquePart {
  title: string;
  file: string;
}

interface ArabesqueEntry {
  title: string;
  composer: string;
  file?: string;
  subtitle?: string;
  arranger?: string;
  parts?: ArabesquePart[];
}

interface ArabesqueCatalog {
  baseUrl?: string;
  scores: ArabesqueEntry[];
}

function scoreUrl(baseUrl: string, file: string): string {
  const base = new URL(baseUrl, SCORE_ORIGIN);
  // Encode each path segment so spaces / accents are safe; keep `/` structure.
  const encoded = file
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return new URL(encoded, base).href;
}

function idFromFile(file: string): string {
  const leaf = file.split("/").pop() ?? file;
  return leaf.replace(/\.(mxl|musicxml|xml)$/i, "");
}

function displayTitle(entry: ArabesqueEntry, partTitle?: string): string {
  const base = partTitle ? `${entry.title}: ${partTitle}` : entry.title;
  if (!partTitle && entry.subtitle?.trim()) {
    return `${base} (${entry.subtitle.trim()})`;
  }
  return base;
}

function displayComposer(entry: ArabesqueEntry): string {
  const arranger = entry.arranger?.trim();
  if (arranger) return `${entry.composer} · arr. ${arranger}`;
  return entry.composer;
}

function pushScore(
  scores: SampleScore[],
  seen: Set<string>,
  entry: ArabesqueEntry,
  file: string,
  partTitle?: string,
  baseUrl = "scores/",
): void {
  const id = `ar-${idFromFile(file)}`;
  if (!file || seen.has(id)) return;
  seen.add(id);
  scores.push({
    id,
    title: displayTitle(entry, partTitle),
    composer: displayComposer(entry),
    path: scoreUrl(baseUrl, file),
  });
}

/** Flatten Arabesque catalog entries (including multi-part sets) into SampleScore rows. */
export function parseArabesqueCatalog(data: ArabesqueCatalog): SampleScore[] {
  const scores: SampleScore[] = [];
  const seen = new Set<string>();
  const baseUrl = data.baseUrl?.trim() || "scores/";

  for (const entry of data.scores ?? []) {
    if (!entry?.title || !entry?.composer) continue;

    if (entry.file) {
      pushScore(scores, seen, entry, entry.file, undefined, baseUrl);
    }

    for (const part of entry.parts ?? []) {
      if (!part?.file || !part?.title) continue;
      pushScore(scores, seen, entry, part.file, part.title, baseUrl);
    }
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

export async function fetchArabesqueLibrary(): Promise<SampleScore[]> {
  const cached = readCache();
  if (cached) return cached;

  const res = await fetch(CATALOG_URL);
  if (!res.ok) {
    throw new Error(`Could not load Arabesque catalog (${res.status}).`);
  }
  const data = (await res.json()) as ArabesqueCatalog;
  const scores = parseArabesqueCatalog(data);
  if (scores.length === 0) {
    throw new Error("Arabesque catalog was empty or unreadable.");
  }
  writeCache(scores);
  return scores;
}
