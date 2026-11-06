# ADR 0016: Write UX declutter (score-first)

## Status

Accepted

## Context

Write mode ([ADR 0011](0011-sheet-music-write-mode.md)) grew a dense toolbar, dual tool rows, and side panels. After the riff clip tray ([ADR 0015](0015-write-riff-clip-tray.md)), first open showed an empty song-form card (duplicating **Song template**) plus an always-visible riff tray, crowding the score and making the mode hard to scan.

## Decision

- **Score-first progressive disclosure:** no empty side panels; the score uses full width by default.
- **Song form helper** mounts only when `sections.length > 0` and the user opens it (auto-open after applying a template). Remove the empty “Choose template” aside.
- **Riff tray** is opt-in via a transport toggle (default closed); capture semantics unchanged.
- Secondary file actions (Blank, library, open file, drafts, downloads) live in a compact **File** menu; Leave, Mode, title, Song template, and Open in Practice stay visible.
- Quiet the tray Keep controls into a single select + action; soften panel chrome.
- Note-writing controls (durations, rest, tie, undo/redo/delete) live in a labeled **Notes** group.
- Remove in-page **Leave Write** (exit via the topbar Write mode segment).
- Write complexity **Mode** sits in the left toolbar with the title; Listen transport (BPM / piano sound / Play) stays in fixed top-right chrome matching Practice’s listen pill; quantize **Grid** sits on the score pane.

## Consequences

- First-visit Write is calmer; form roadmap and riff tray remain one click away when needed.
- Users must discover the Riff tray toggle for clip workflows (acceptable vs permanent side chrome).
- Song template remains the only empty-state entry to forms.
- Leaving Write is only via the global mode bar — no duplicate Leave control.

## Code anchors

- `src/ui/WriteWorkspace.tsx`
- `src/ui/WriteClipTray.tsx`
- `src/ui/SongFormHelper.tsx`
- `src/index.css` (Write / tray layout)
