import { useEffect, useRef } from "react";
import { CONTROL_KEY_HELP } from "../input/controlKeys";

interface PianoControlsHelpProps {
  open: boolean;
  onClose: () => void;
}

export function PianoControlsHelp({ open, onClose }: PianoControlsHelpProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="help-overlay"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="piano-controls-help-title"
      >
        <h2 id="piano-controls-help-title">Piano controls</h2>
        <p>
          When <strong>Piano controls</strong> is on, the extreme keys on an 88-key piano (and the
          matching on-screen keys) act as app buttons instead of practice notes. They work from both
          MIDI and the on-screen keyboard.
        </p>
        <ul className="help-key-list">
          {CONTROL_KEY_HELP.map((entry) => (
            <li key={entry.key}>
              <span className="help-key">{entry.key}</span>
              <span className="help-gesture">{entry.gesture}</span>
              <span className="help-action">{entry.action}</span>
            </li>
          ))}
        </ul>
        <p className="muted small">
          A single tap on A0 is ignored (consumed, no practice). Only a double-tap restarts. Turn the
          toggle off if your score needs A0, B0, C1, A7, B7, or C8 as normal notes.
        </p>
        <div className="help-dialog-actions">
          <button ref={closeRef} type="button" className="btn primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
