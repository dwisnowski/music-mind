import { useSyncExternalStore } from "react";
import type { SampleScore } from "./samples";

const STORAGE_KEY = "music-mind:recent-scores";
const MAX_RECENT = 12;

export interface RecentScore extends SampleScore {
  playedAt: number;
}

let cache: RecentScore[] = readStored();
const listeners = new Set<() => void>();

function isRecentScore(value: unknown): value is RecentScore {
  if (!value || typeof value !== "object") return false;
  const score = value as Partial<RecentScore>;
  return (
    typeof score.id === "string" &&
    typeof score.title === "string" &&
    typeof score.composer === "string" &&
    typeof score.path === "string" &&
    typeof score.playedAt === "number"
  );
}

function readStored(): RecentScore[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isRecentScore).slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function publish(next: RecentScore[]): void {
  cache = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* quota or private mode */
  }
  for (const listener of listeners) listener();
}

/** Remember a catalog score after it successfully opens. Local file uploads are not recorded. */
export function rememberRecentScore(sample: SampleScore): void {
  const next: RecentScore = {
    id: sample.id,
    title: sample.title,
    composer: sample.composer,
    path: sample.path,
    playedAt: Date.now(),
  };
  publish([next, ...cache.filter((score) => score.id !== sample.id)].slice(0, MAX_RECENT));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): RecentScore[] {
  return cache;
}

export function useRecentScores(): RecentScore[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
