/** C major white keys C4–B4 (MIDI 60–71). */
export const SCALE_MIDI = [60, 62, 64, 65, 67, 69, 71] as const;

export const DEFAULT_BPM = 90;

/** Beats of silence / “Listen” flash before phrase playback. */
export const COUNT_IN_BEATS = 2;

/** Quarter-note duration per phrase note. */
export const NOTE_BEATS = 1;

/** Rounds grow in length: 3 → 4 → 5 → 6. */
export const ROUND_LENGTHS = [3, 4, 5, 6] as const;

export const ROUND_COUNT = ROUND_LENGTHS.length;
