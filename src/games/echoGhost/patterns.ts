import { SCALE_MIDI } from "./constants";

/**
 * Generate a mild stepwise C-major fragment of `length` notes in C4–B4.
 * Mostly ±1 / ±2 scale degrees; occasional repeat.
 */
export function generateEchoPhrase(length: number): number[] {
  const n = Math.max(1, Math.floor(length));
  const degrees = SCALE_MIDI.length;
  let deg = Math.floor(Math.random() * degrees);
  const out: number[] = [SCALE_MIDI[deg]!];

  for (let i = 1; i < n; i++) {
    const roll = Math.random();
    let step = 0;
    if (roll < 0.12) {
      step = 0; // repeat
    } else if (roll < 0.72) {
      step = Math.random() < 0.5 ? -1 : 1;
    } else {
      step = Math.random() < 0.5 ? -2 : 2;
    }
    deg = Math.min(degrees - 1, Math.max(0, deg + step));
    out.push(SCALE_MIDI[deg]!);
  }

  return out;
}
