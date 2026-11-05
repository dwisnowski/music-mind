import type { JudgmentGrade } from "./types";

/** Absolute ms from the judgment line. */
export const PERFECT_WINDOW_MS = 50;
export const GOOD_WINDOW_MS = 120;

export function gradeTiming(deltaMs: number): JudgmentGrade | null {
  const abs = Math.abs(deltaMs);
  if (abs <= PERFECT_WINDOW_MS) return "perfect";
  if (abs <= GOOD_WINDOW_MS) return "good";
  return null;
}

/** Late beyond the good window → miss. Early notes are left for a later attempt. */
export function isPastMiss(deltaMs: number): boolean {
  return deltaMs > GOOD_WINDOW_MS;
}
