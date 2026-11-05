# ADR 0008: Echo Ghost

## Status

Accepted

## Context

[ADR 0006](0006-timed-falling-lights.md) established timed mini-games as a separate lifecycle from Feedback/Listen, with Falling Lights as the first game (falling targets + timing windows). Ear training needs a different loop: hear a short phrase, then replay it from memory. That game was deferred as Echo Ghost; Falling Lights has proven the mode shell and MIDI routing.

## Decision

- **Echo Ghost** is the second timed mini-game under the ADR 0006 lifecycle: entering pauses Feedback/Listen; exiting restores the practice shell without unloading the score.
- **Content** is generated in-client: C major white keys in **C4–B4** (MIDI 60–71); four rounds of length **3 → 4 → 5 → 6**. No MusicXML, staff reading, or score binding.
- **Loop:** listen (Web Audio phrase playback + optional keyboard ghosting) → echo (capture note-ons in order) → round result → next round or session finish. BPM is user-settable for playback spacing only.
- **Grading is pitch-order only** (rhythm-tolerant). One attempt per expected slot: correct pitch = hit; wrong pitch = miss and advance. Timing windows from ADR 0006 are unused. Session scores stay local (hits / miss / accuracy); no Worker persistence.
- Playback uses a small `PhrasePlayer` (oscillator scheduling), not a fake `LoadedScore` / `ScorePlayer` path.
- Code lives under `src/games/echoGhost/`; the SPA routes MIDI/clicks to the active game engine.

## Consequences

- Extends ADR 0006 without changing Falling Lights judgment or stage.
- On-screen keyboard clicks work for echo capture (`performance.now()`; no MIDI timestamp needed for pitch-only grading).
- Score snippets, groove grading, and harmony echoes remain future work.
- App mode shell grows to multiple game ids (`fallingLights` | `echoGhost`) behind a shared `gameActive` gate.

## Code anchors

- `src/games/echoGhost/` — patterns, PhrasePlayer, engine, UI
- `src/App.tsx` — multi-game mode shell / MIDI routing
- [ADR 0006](0006-timed-falling-lights.md) — shared timed-game lifecycle
