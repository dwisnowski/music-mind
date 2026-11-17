# ADR 0017: Write note multi-select editing

## Status

Accepted

## Context

Write mode ([ADR 0011](0011-sheet-music-write-mode.md)) already tracks a single `selectionId` for lyrics and delete, but the score click path only jumped the cursor to a measure and never highlighted the chosen note. Authors need to select one or many notes on the OSMD preview and edit them together: delete, transpose (“shift”), and change duration — with familiar modifiers (Shift = sequential range, Ctrl/Cmd = non-contiguous toggle).

## Decision

- Store multi-selection on `WriteDocument` as **`selectionIds: string[]`** plus **`selectionAnchorId`** for Shift-range endpoints. Plain click replaces; Shift+click selects the inclusive document-order range from the anchor; Ctrl/Cmd+click toggles membership.
- Treat **select / cursor** updates as non-history UI mutations so multi-click selection does not flood Undo.
- Map score clicks in Write to a write-note id via nearest OSMD note (pitch + onset) matched against a flattened note order derived from the document — not via measure-first heuristics alone.
- Highlight selected noteheads/stems in a distinct selection color after each OSMD render (and when selection changes without XML churn).
- Selection-scoped commands: **delete**, **shift pitch by semitones**, **set duration** from the duration palette when any notes are selected (palette still updates `stepDuration` for new entry).

## Consequences

- Practice/Listen click semantics on `ScoreView` stay default; Write passes an optional selection handler that takes over idle clicks (Option/Alt still seeks Listen).
- Chord write-notes remain one selectable unit (all chord tones highlight together).
- Changing duration on a multi-selection can leave voice occupancy uneven until the author adjusts neighboring rests — acceptable for Simple editing; no automatic reflow in this ADR.
- Extends [ADR 0011](0011-sheet-music-write-mode.md) and the score-first chrome of [ADR 0016](0016-write-ux-declutter.md).

## Code anchors

- `src/write/document.ts`, `src/write/commands.ts`, `src/write/noteOrder.ts`
- `src/ui/ScoreView.tsx`, `src/ui/WriteWorkspace.tsx`
