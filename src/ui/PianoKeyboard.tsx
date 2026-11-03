import { PIANO_HIGH, PIANO_LOW, midiToName } from "../midi/types";

export type KeyVisualState = "idle" | "expected" | "heard" | "correct" | "wrong";

interface PianoKeyboardProps {
  states: Map<number, KeyVisualState>;
  onKeyClick?: (midi: number) => void;
}

const WHITE_PC = new Set([0, 2, 4, 5, 7, 9, 11]);

function isWhite(midi: number) {
  return WHITE_PC.has(midi % 12);
}

export function PianoKeyboard({ states, onKeyClick }: PianoKeyboardProps) {
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
          return (
            <button
              key={midi}
              type="button"
              className={`key white state-${state}`}
              style={{ width: `${whiteWidth}%` }}
              title={midiToName(midi)}
              aria-label={midiToName(midi)}
              onClick={() => onKeyClick?.(midi)}
              data-index={i}
            />
          );
        })}
      </div>
      <div className="keyboard-blacks">
        {blacks.map((midi) => {
          const state = states.get(midi) ?? "idle";
          const whitesBefore = whites.filter((w) => w < midi).length;
          const left = whitesBefore * whiteWidth - whiteWidth * 0.32;
          return (
            <button
              key={midi}
              type="button"
              className={`key black state-${state}`}
              style={{ left: `${left}%`, width: `${whiteWidth * 0.64}%` }}
              title={midiToName(midi)}
              aria-label={midiToName(midi)}
              onClick={() => onKeyClick?.(midi)}
            />
          );
        })}
      </div>
    </div>
  );
}
