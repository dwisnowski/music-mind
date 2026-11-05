export type JudgmentGrade = "perfect" | "good" | "miss";

export type GameLane = "left" | "right";

export interface SessionScore {
  hits: number;
  perfect: number;
  good: number;
  miss: number;
  combo: number;
  maxCombo: number;
  total: number;
}

export function emptySessionScore(total = 0): SessionScore {
  return {
    hits: 0,
    perfect: 0,
    good: 0,
    miss: 0,
    combo: 0,
    maxCombo: 0,
    total,
  };
}

export function accuracyPercent(score: SessionScore): number {
  if (score.total === 0) return 0;
  return Math.round((score.hits / score.total) * 100);
}
