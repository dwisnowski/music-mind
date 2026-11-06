# ADR 0011: Sheet music Write mode

## Status

Accepted

## Context

Music Mind today loads MusicXML for Feedback practice and Listen playback ([ADR 0001](0001-mvp-practice-architecture.md), [ADR 0003](0003-listen-play-pause-from-practice.md)). There is no path to author or edit scores by playing the piano or on-screen keyboard. Users want a full Write mode: step entry and live metronome recording, progressive UI complexity (Simple / Simple+lyrics / Advanced), song-form templates that scaffold typical section patterns, local drafts, and Listen playback of drafts — without introducing a second notation engine.

## Decision

- Add an `AppMode` of **`write`**, separate from practice and mini-games. MIDI and on-screen keys feed Write capture while active; Feedback and ADR 0004 control-key consumption are diverted/disabled so extreme keys can be notated.
- Keep an editable **`WriteDocument`** as source of truth (measures, voices, notes/rests, section map, lyrics, advanced markings). Serialize to MusicXML for OSMD preview, Listen (`ScorePlayer` via `parseMusicXmlTimeline`), download, and **Open in Practice**.
- **OSMD remains the only notation renderer** (debounced re-render from serialized XML). No VexFlow or second engine.
- Support **step entry** (duration palette + note-on/chord insert at cursor) and **live record** (metronome + quantize into the document).
- Expose three **Write complexity modes** as progressive disclosure of one document: Simple; Simple + lyrics; Advanced (beams, articulations, dynamics, voices, tuplets, pickups, repeats/voltas).
- Offer **song-form templates** (pop standard, pop with interlude, verse–chorus short, AABA, 12-bar blues, custom) that create labeled empty measure blocks, rehearsal marks, and a **Song Form Helper** roadmap with writer prompts.
- Persist drafts in **IndexedDB** (`music-mind-drafts`) with MusicXML + write mode + optional song-form sidecar; also download `.musicxml`/`.mxl`.
- Open paths: blank, new-from-template, library/loaded MusicXML into Write, Open in Practice from a draft.

## Consequences

- Bundle cost stays OSMD-dominated; Write re-renders may hitch on large scores (debounce mitigates).
- MusicXML round-trip quality limits advanced markings; imperfect import from arbitrary library files is acceptable if playable notes survive.
- Write and Practice share Listen transport patterns but not Feedback state.
- Song templates scaffold structure and prompts only — they do not auto-compose melody or harmony.
- Hybrid riff capture (rolling buffer + clip tray, velocity/pedal) is specified in [ADR 0015](0015-write-riff-clip-tray.md).
- Score-first chrome declutter (opt-in panels, File menu) is specified in [ADR 0016](0016-write-ux-declutter.md).

## Code anchors

- `src/write/` (document, commands, MusicXML I/O, capture, quantize, song forms, drafts)
- `src/ui/WriteWorkspace.tsx`
- `src/App.tsx` (`AppMode` `"write"`)
