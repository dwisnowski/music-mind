# ADR 0019: Library grid and recent scores

## Status

Accepted

## Context

Library browse ([ADR 0013](0013-home-and-library-pages.md)) stacked Quick start, then one catalog, in a `36rem` column. Remote catalogs from [ADR 0005](0005-musetrainer-remote-library.md) and [ADR 0007](0007-arabesque-remote-library.md) are long enough that a single scrolling list hides most titles. There is no way to return to a score just opened, and a file chosen with Load score cannot be reopened without the bytes.

## Decision

- Quick start is a disclosure. It starts open. The open or closed choice is stored in `localStorage` (`music-mind:quick-start-open`).
- Widen the library page so the active catalog (Remote, Personal, or Recent) is a grid: four columns from about `1000px`, two on a tablet, one on a phone. The page intro stays a narrow centered column. The same grid is used in Write’s library drawer.
- Every catalog tab has search. Remote also filters by source (All, MuseTrainer, Arabesque). Sort is Title A–Z, Title Z–A, or Composer A–Z. Recent opens ordered by most recently opened.
- A **Recent** tab lists up to 12 catalog scores that successfully opened in Practice or Write. Entries (`id`, `title`, `composer`, `path`, `playedAt`) live in `localStorage` (`music-mind:recent-scores`) on this device. Failed loads and Load score file picks are not recorded.

## Consequences

- Recent history does not sync across browsers or devices, and clearing site data drops it.
- MuseTrainer rows still have no real composer, so composer sort clumps them; source filter is the useful split.
- The library page is wider than the previous `36rem` column. Narrow viewports fall back to fewer grid columns.

## Code anchors

- `src/ui/LibraryBrowser.tsx`, `src/ui/LibraryPage.tsx`
- `src/score/recentScores.ts`
- `src/App.tsx`, `src/ui/WriteWorkspace.tsx` (record after a successful open)
