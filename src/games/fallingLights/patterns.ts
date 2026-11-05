import type { GameLane } from "../types";
import { FALLING_LEFT_MIDI, FALLING_RIGHT_MIDI } from "./constants";

export interface PatternNote {
  /** Beat index from the start of the playable section (after count-in). */
  beat: number;
  lane: GameLane;
  midi: number;
}

/**
 * Short hand-authored-style grid: alternation, unison hits, and light syncopation.
 * Beats are quarter-note indices.
 */
export function buildFallingLightsPattern(beatCount = 32): PatternNote[] {
  const notes: PatternNote[] = [];

  const push = (beat: number, lane: GameLane) => {
    notes.push({
      beat,
      lane,
      midi: lane === "left" ? FALLING_LEFT_MIDI : FALLING_RIGHT_MIDI,
    });
  };

  for (let b = 0; b < Math.min(8, beatCount); b++) {
    push(b, b % 2 === 0 ? "left" : "right");
  }

  for (let b = 8; b < Math.min(16, beatCount); b++) {
    if (b % 2 === 0) {
      push(b, "left");
      push(b, "right");
    } else {
      push(b, b % 4 === 1 ? "right" : "left");
    }
  }

  for (let b = 16; b < Math.min(24, beatCount); b++) {
    push(b, "left");
    if (b % 2 === 1) push(b + 0.5, "right");
  }

  for (let b = 24; b < beatCount; b++) {
    if (b % 4 === 0) {
      push(b, "left");
      push(b, "right");
    } else if (b % 4 === 2) {
      push(b, "right");
      push(b + 0.5, "left");
    } else {
      push(b, b % 2 === 0 ? "left" : "right");
    }
  }

  notes.sort((a, b) => a.beat - b.beat || (a.lane === "left" ? -1 : 1));
  return notes;
}
