# ADR 0012: Free Practice mode (scales, riffs, theory helpers)

## Status

Accepted

## Context

Music Mind’s Feedback practice ([ADR 0001](0001-mvp-practice-architecture.md)) and mini-games train specific scores or timed skills. There is no mode for open improvisation with lit scale maps, genre riffs as melodic trainers, or on-screen music theory that explains what sounds good together. Users want a Free Practice section: always-on scale helpers, guided call-and-response riffs (blues, pop, EDM, country, classical, etc.), and theory overlays (diatonic chords, live intervals, circle of fifths) that drive the same Williams LEDs and on-screen keyboard.

## Decision

- Add an `AppMode` of **`freePractice`**, sibling to Practice / Write / Games — not a timed mini-game and not score-based. No MusicXML / OSMD / Feedback while active.
- Ship a shared **`src/theory/`** module: scale builders, diatonic chords, interval classification, circle-of-fifths neighbors, genre defaults, and scale-degree riff catalogs (transposed by root).
- Support two lighting modes in one workspace:
  - **Free:** light scale degrees in a capped 3-octave window; optional selected diatonic chord tones light stronger.
  - **Guided:** wait-for-me call-and-response on a chosen riff (next note only); optional timed Demo walk without requiring input.
- Extend on-screen `KeyVisualState` with soft **`scale`** and stronger **`chord`** states; reuse `expected` / `correct` / `wrong` / `heard` for guided play. Physical LEDs continue via `WilliamsLights.setExpected` (chord tones or full scale window in Free; singleton next note in Guided).
- Theory UI ships all three helpers as tabs: **Chords**, **Intervals** (from held notes), **Circle** (related keys / mix tips).
- MIDI and dock keys update a held set for intervals; Guided feeds a small `FreePracticeEngine`; App owns lights and mode entry/exit (mirror Write: stop Listen/games, Leave Free Practice).

## Consequences

- Improvisation helpers are client-only catalogs; genre list is a starter set of five and easy to extend without changing the App shell.
- Lighting many scale notes can flood MIDI; the 3-octave window is an intentional cap until multi-color SysEx exists.
- Free Practice does not grade tempo or award session scores; guided advance is pitch-order only (same spirit as Feedback wait-for-me).
- Theory blurbs are pedagogical shortcuts, not a full curriculum.
- User-saved absolute-MIDI riffs from Write clips are specified in [ADR 0015](0015-write-riff-clip-tray.md); they sit beside the built-in degree catalog.

## Code anchors

- `src/theory/`
- `src/freePractice/` (`FreePracticeEngine`, `FreePracticeWorkspace`)
- `src/App.tsx` (`AppMode` `"freePractice"`)
- `src/ui/PianoKeyboard.tsx` (`scale` / `chord` visual states)
