import { PIANO_HIGH, PIANO_LOW, midiToName } from "../midi/types";
import { CONTROL_KEY_HINTS, isReservedControlMidi } from "../input/controlKeys";

export type KeyVisualState =
  | "idle"
  | "expected"
  | "heard"
  | "correct"
  | "wrong"
  | "scale"
  | "chord";

interface PianoKeyboardProps {
  states: Map<number, KeyVisualState>;
  onKeyClick?: (midi: number) => void;
  /** When true, reserved edge keys show control affordances. */
  controlsEnabled?: boolean;
}

const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);

function isWhite(midi: number) {
  return WHITE_PC.has(midi % 12);
}

function keyLabel(midi: number, controlsEnabled: boolean): string {
  if (controlsEnabled) {
    const hint = CONTROL_KEY_HINTS.get(midi);
    if (hint) return hint;
  }
  return midiToName(midi);
}

export function PianoKeyboard({ states, onKeyClick, controlsEnabled = false }: PianoKeyboardProps) {
  const whites: number[] = [];
  const blacks: number[] = [];
  for (let n = PIANO_LOW; n <= PIANO_HIGH; n++) {
    if (isWhite(n)) whites.push(n);
    else blacks.push(n);
  }

  const whiteWidth = 100 / whites.length;

  return (
    <div className="keyboard" role="group" aria-label="Piano keyboard">
      <div className="keyboard-whites">
        {whites.map((midi, i) => {
          const state = states.get(midi) ?? "idle";
          const isControl = controlsEnabled && isReservedControlMidi(midi);
          const label = keyLabel(midi, controlsEnabled);
          return (
            <button
              key={midi}
              type="button"
              className={`key white state-${state}${isControl ? " key-control" : ""}`}
              style={{ width: `${whiteWidth}%` }}
              title={label}
              aria-label={label}
              onClick={() => onKeyClick?.(midi)}
              data-index={i}
            />
          );
        })}
      </div>
      <div className="keyboard-blacks">
        {blacks.map((midi) => {
          const state = states.get(midi) ?? "idle";
          const isControl = controlsEnabled && isReservedControlMidi(midi);
          const label = keyLabel(midi, controlsEnabled);
          const whitesBefore = whites.filter((w) => w < midi).length;
          const left = whitesBefore * whiteWidth - whiteWidth * 0.32;
          return (
            <button
              key={midi}
              type="button"
              className={`key black state-${state}${isControl ? " key-control" : ""}`}
              style={{ left: `${left}%`, width: `${whiteWidth * 0.64}%` }}
              title={label}
              aria-label={label}
              onClick={() => onKeyClick?.(midi)}
            />
          );
        })}
      </div>
    </div>
  );
}
