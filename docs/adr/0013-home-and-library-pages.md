# ADR 0013: Home landing, dedicated Library, and topbar mode group

## Status

Accepted

## Context

Until now, Music Mind’s “home” was the practice empty state: Load score copy, library catalog, and mode launchers all lived in one `empty-score` surface when `appMode === "practice"` and no score was loaded. That conflated product introduction with score browsing, left no room for a brand-led landing, and scattered Games / Free Practice / Write as separate topbar controls even though only one of those sibling modes can be active ([ADR 0006](0006-timed-falling-lights.md), [ADR 0011](0011-sheet-music-write-mode.md), [ADR 0012](0012-free-practice-mode.md)).

## Decision

- Extend in-memory `AppMode` with **`home`** and **`library`** (no URL router). Default mode is `home`. Practice remains score-driven; library hosts the former empty-score UI (Load score, catalog via [ADR 0005](0005-musetrainer-remote-library.md) / [ADR 0007](0007-arabesque-remote-library.md)).
- Brand → `home`; Library topbar → `library`; loading a score → `practice`. Exiting Write / Free Practice / Games returns to `practice` if a score is loaded, otherwise `home`.
- Hide the piano dock on `home` so the landing is one composition; keep dock on library and other modes.
- Home uses a Canvas 2D particle wordmark (Anime.js choreography, pointer repulsion, reduced-motion static frame) in Music Mind’s palette — same technique family as the Wild Idea Zone hub hero, not a copy of its Morse/WIZ story.
- Collapse Games, Free Practice, and Write into one segmented topbar **mode group** (mutually exclusive; active segment exits on re-click). Settings becomes an accessible gear icon.

## Consequences

- Deep links still do not exist; refresh always lands on `home`.
- Capacitor / SPA hosting unchanged ([ADR 0001](0001-mvp-practice-architecture.md)).
- Topbar is denser; Games keeps a nested picker inside its segment.
- Particle animation adds an `animejs` dependency and a home-only canvas cost (paused offscreen).

## Code anchors

- `src/App.tsx` (`AppMode` `"home"` / `"library"`, mode group, gear Settings)
- `src/ui/HomePage.tsx`, `src/ui/LibraryPage.tsx`
- `src/home/musicMindScene.ts`, `src/ui/MusicMindParticles.tsx`
