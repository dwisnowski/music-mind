# ADR 0006: Timed mini-games and Falling Lights

## Status

Accepted

## Context

[ADR 0001](0001-mvp-practice-architecture.md) ships Feedback as wait-for-correct-notes only and defers metronome / “moving stage” grading. Two-hand timing and accent independence need a different loop: external focus on falling targets, fixed home keys, and hit windows — not MusicXML reading. Cloudflare Workers remains static SPA hosting; all timing runs in the browser (or Capacitor WebView).

## Decision

- **Timed games are a separate lifecycle from Feedback/Listen.** Entering a game pauses Feedback advancement and Listen transport; exiting restores the prior practice shell without unloading the score.
- **Clock authority** is `performance.now()` (ms). MIDI adapter timestamps are preserved and normalized onto that clock via a one-shot offset (`perf − midiTs` on first note of a session) so grading can use device timestamps when available.
- **Judgment windows (v1):** perfect ≤ ±50 ms, good ≤ ±120 ms from the judgment line; later or wrong key = miss. Extra notes on non-target pitches are ignored (not wrong).
- **Falling Lights** is the first timed game: two lanes / fixed pitches **C3 (LH, MIDI 48)** and **C5 (RH, MIDI 72)**; neon targets fall to a judgment line; count-in then a short generated pattern (alternation / unison / light syncopation). No MusicXML, staff reading, or chord shapes.
- **Content** is generated in-client from beat grids at a user BPM; scores stay session-local (hit / perfect / good / miss / combo). No Worker game tick, leaderboards, or cloud save.
- Code lives under `src/games/`; the SPA mode shell routes MIDI note-ons to the active game instead of `FeedbackEngine` while playing.

## Consequences

- Extends ADR 0001 without replacing Feedback; Listen and piano control keys remain available outside the game (controls still intercepted first when enabled).
- On-screen keyboard can click home keys for practice without MIDI; click timing uses `performance.now()` (no MIDI timestamp).
- Later games (Beat Dodger, Chord Crush, Sight-scroll) may reuse the clock / judgment / score helpers; they are out of scope for this decision. Echo Ghost is specified in [ADR 0008](0008-echo-ghost.md).
- Bundle size grows with the stage UI; keep game modules importable from a dedicated entry path if splitting becomes necessary.

## Code anchors

- `src/games/` — clock, judgment, Falling Lights engine + UI
- `src/App.tsx` — mode shell / MIDI routing while a game is active
- `src/midi/types.ts` — `MidiMessageHandler` timestamp
