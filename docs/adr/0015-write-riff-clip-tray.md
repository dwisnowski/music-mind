# ADR 0015: Write hybrid riff capture + clip tray

## Status

Accepted

## Context

Write mode ([ADR 0011](0011-sheet-music-write-mode.md)) supports step entry and armed metronome Record that merges directly into the score. Free Practice ([ADR 0012](0012-free-practice-mode.md)) offers only a static scale-degree riff catalog. Writers often jam freely and want to **keep, chop, and reuse** short ideas without committing every take to notation. MIDI velocity and sustain pedal arrive from hardware but were discarded before Write saw them.

## Decision

- Add a **hybrid performance scratchpad** in Write that does not replace step entry or armed Record→score:
  - **Rolling MIDI buffer** — while Write is open, retain ~60s of note-on/off (with velocity) and pedal CCs (64/66/67); no metronome; never auto-merge into the score.
  - **Clip tray** — named `WriteClip` takes (Keep recent / Capture take / optional save-from-Record) with nondestructive trim, audition, insert at cursor, and optional export to Free Practice.
- Persist clips in IndexedDB (`music-mind-clips`) independently of draft MusicXML.
- **Retain numeric velocity (0–127)** end-to-end on capture events, clips, optional `WriteNote.velocity`, and MusicXML round-trip; optionally derive printed dynamics bands as an additive marking.
- **Retain sustain/pedal CC** on buffer/clips; replay on audition; insert as MusicXML `<pedal>` directions on the document.
- Free Practice **user riffs** (`music-mind-user-riffs`) store absolute MIDI pitch sequences for Guided wait-for-me; built-in degree riffs stay unchanged. Velocity/pedal are not used in Guided grading.

## Consequences

- Write MIDI sink grows beyond notes (velocity + CC); App must parse control-change while Write is active.
- Clip audition needs a lightweight timed player (notes + pedal CC), separate from OSMD Listen of the full draft.
- Document/MusicXML gain velocity and pedal side channels; imperfect OSMD pedal display is acceptable if round-trip and Listen/player-piano can use the data.
- User Free Practice riffs are client-only and genre-tagged; no cloud sync.
- Tray chrome is opt-in by default per [ADR 0016](0016-write-ux-declutter.md); capture behavior is unchanged.

## Code anchors

- `src/write/rollingBuffer.ts`, `clipStore.ts`, `clipModel.ts`, `clipPlayer.ts`
- `src/write/capture.ts`, `quantize.ts`, `document.ts`, `commands.ts`, `toMusicXml.ts`, `fromMusicXml.ts`
- `src/theory/userRiffStore.ts`
- `src/ui/WriteWorkspace.tsx`, `src/ui/WriteClipTray.tsx`
- `src/midi/types.ts`, `src/App.tsx`, `src/freePractice/FreePracticeWorkspace.tsx`
