# ADR 0009: Balloon Pop

## Status

Accepted

## Context

[ADR 0006](0006-timed-falling-lights.md) established timed mini-games with a shared App mode shell and `performance.now()` clock. Falling Lights grades timing on fixed home keys; [ADR 0008](0008-echo-ghost.md) grades pitch-order memory. A kid-friendly “knock something out of the sky” loop is still missing: targets drift across a stage, and the player pops them by playing the labeled note or chord before they leave.

## Decision

- **Balloon Pop** is a third timed mini-game under the ADR 0006 lifecycle: entering pauses Feedback/Listen; exiting restores practice without unloading the score.
- **Theme:** candy-colored balloons with note/chord labels float across a daytime sky. Correct play pops the balloon (SFX + fall). No hunting / weapon framing.
- **Difficulty** (Easy / Medium / Hard) is chosen before Start and locked for the run. It owns balloon count, fly window, spawn density, max concurrent balloons, and chord mix — no separate BPM control.
  - Easy: singles only, C4–G4 white keys, slow float.
  - Medium: C4–B4 singles plus ~25% C/F/G major triads.
  - Hard: denser sky, ~45% chords, up to three concurrent targets.
- **Grading** is presence-window matching (oldest active balloon whose pitches are satisfied), not Falling Lights ±ms windows. Misses occur when a balloon exits unpopped. Session scores stay local (hits / miss / combo / accuracy).
- **Chord input** uses currently held MIDI plus a short grace window for staggered note-ons. App routes note-offs into the engine while Balloon Pop is active.
- **Hit SFX** is a small Web Audio pop + root plink in `popSynth.ts`, gated by the existing Sound toggle.
- Code lives under `src/games/balloonPop/`.

## Consequences

- Extends ADR 0006 without changing Falling Lights or Echo Ghost judgment.
- App mode shell grows (`fallingLights` | `echoGhost` | `balloonPop`); Balloon Pop uniquely needs note-off routing for held chords.
- On-screen keyboard clicks work for singles and quick multi-tap chords via the grace window.
- Sight-reading from MusicXML and cloud scores remain out of scope.

## Code anchors

- `src/games/balloonPop/` — constants, patterns, engine, popSynth, UI
- `src/App.tsx` — multi-game mode shell / MIDI note-on and note-off routing
- [ADR 0006](0006-timed-falling-lights.md) — shared timed-game lifecycle
- [ADR 0008](0008-echo-ghost.md) — sibling pitch-focused mini-game
