# ADR 0004: Piano edge keys as app controls

## Status

Accepted

## Context

Hands-free practice needs transport and cursor actions without reaching for the browser. Extreme keys on an 88-key piano (and the matching on-screen keyboard) are rarely required for beginner/intermediate scores, so they can act as buttons. Listen already exposes play/pause/stop and Feedback exposes reset/seek ([ADR 0003](0003-listen-play-pause-from-practice.md)); what was missing was a shared input path that consumes those keys before Feedback matching, plus a short Listen window (“next N events”).

## Decision

- When **Piano controls** is enabled, reserved MIDI notes are intercepted for both Web/Capacitor MIDI and on-screen key clicks; they never call `FeedbackEngine.noteOn` / `noteOff`.
- Control map (v1):

  | MIDI | Key | Gesture | Action |
  |------|-----|---------|--------|
  | 21 | A0 | double-tap (~400ms) | Practice `reset()` |
  | 23 | B0 | single tap | Practice cursor back 1 event (`stepBy(-1)`) |
  | 24 | C1 | single tap | Practice cursor forward 1 event (`stepBy(+1)`) |
  | 105 | A7 | single tap | Stop Listen |
  | 107 | B7 | single tap | Listen next **10 events** |
  | 108 | C8 | single tap | Listen play / pause |

- A0 single tap is consumed (no practice) but does nothing; only double-tap resets.
- B0 / C1 move the practice cursor only.
- ScorePlayer accepts `maxEvents` for a bounded Listen window; window end leaves Listen **paused** on the last played event.
- UI toggle **Piano controls** in the dock, persisted as `mm.pianoControls` (`"1"` / `"0"`), default on. When off, reserved keys behave as normal practice notes.
- On-screen keyboard marks reserved keys only while the toggle is on.

## Consequences

- Scores that use A0 / B0 / C1 / A7 / B7 / C8 cannot practice those pitches while controls are enabled — users must turn the toggle off.
- Extends [ADR 0003](0003-listen-play-pause-from-practice.md) Listen transport; does not change UI Play (still remaining-to-end).
- Double-tap timing is fixed; remappable bindings are out of scope for v1.

## Code anchors

- `src/input/controlKeys.ts`
- `src/practice/feedbackEngine.ts` (`stepBy`)
- `src/audio/scorePlayer.ts` (`maxEvents`)
- `src/ui/PianoKeyboard.tsx`
- `src/App.tsx`
