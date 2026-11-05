/** MIDI notes reserved as app controls when Piano controls is enabled. */

export type ControlAction =
  | "reset"
  | "stepBack"
  | "stepForward"
  | "playPause"
  | "next10"
  | "stop";

export const CONTROL_MIDI = {
  reset: 21, // A0
  stepBack: 23, // B0
  stepForward: 24, // C1
  stop: 105, // A7
  next10: 107, // B7
  playPause: 108, // C8
} as const;

export const RESERVED_CONTROL_MIDI = new Set<number>(Object.values(CONTROL_MIDI));

const DOUBLE_TAP_MS = 400;

export const CONTROL_KEY_HINTS: ReadonlyMap<number, string> = new Map([
  [CONTROL_MIDI.reset, "A0 · double-tap: Restart"],
  [CONTROL_MIDI.stepBack, "B0 · Back 1 event"],
  [CONTROL_MIDI.stepForward, "C1 · Forward 1 event"],
  [CONTROL_MIDI.stop, "A7 · Stop Listen"],
  [CONTROL_MIDI.next10, "B7 · Next 10 events"],
  [CONTROL_MIDI.playPause, "C8 · Play/Pause"],
]);

export type ControlKeyHelpEntry = {
  key: string;
  gesture: string;
  action: string;
};

/** Structured help copy for the Piano controls overlay (matches ADR 0004). */
export const CONTROL_KEY_HELP: readonly ControlKeyHelpEntry[] = [
  { key: "A0", gesture: "Double-tap (~400ms)", action: "Restart practice" },
  { key: "B0", gesture: "Tap", action: "Practice cursor back 1 event" },
  { key: "C1", gesture: "Tap", action: "Practice cursor forward 1 event" },
  { key: "A7", gesture: "Tap", action: "Stop Listen" },
  { key: "B7", gesture: "Tap", action: "Listen next 10 events" },
  { key: "C8", gesture: "Tap", action: "Listen Play / Pause" },
];

export function isReservedControlMidi(midi: number): boolean {
  return RESERVED_CONTROL_MIDI.has(midi);
}

export type ControlNoteResult =
  | { consumed: false }
  | { consumed: true; action: ControlAction | null };

/**
 * Maps reserved note-ons to control actions. A0 requires a double-tap within
 * DOUBLE_TAP_MS; a single A0 tap is consumed with no action.
 */
export class ControlKeyHandler {
  private lastResetAt = 0;

  clear() {
    this.lastResetAt = 0;
  }

  handleNoteOn(midi: number): ControlNoteResult {
    if (!RESERVED_CONTROL_MIDI.has(midi)) {
      return { consumed: false };
    }

    if (midi === CONTROL_MIDI.reset) {
      const now = performance.now();
      if (this.lastResetAt > 0 && now - this.lastResetAt <= DOUBLE_TAP_MS) {
        this.lastResetAt = 0;
        return { consumed: true, action: "reset" };
      }
      this.lastResetAt = now;
      return { consumed: true, action: null };
    }

    this.lastResetAt = 0;

    switch (midi) {
      case CONTROL_MIDI.stepBack:
        return { consumed: true, action: "stepBack" };
      case CONTROL_MIDI.stepForward:
        return { consumed: true, action: "stepForward" };
      case CONTROL_MIDI.stop:
        return { consumed: true, action: "stop" };
      case CONTROL_MIDI.next10:
        return { consumed: true, action: "next10" };
      case CONTROL_MIDI.playPause:
        return { consumed: true, action: "playPause" };
      default:
        return { consumed: true, action: null };
    }
  }
}
