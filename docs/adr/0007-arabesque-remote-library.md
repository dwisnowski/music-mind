# ADR 0007: Arabesque remote library

## Status

Accepted

## Context

[ADR 0005](0005-musetrainer-remote-library.md) loads MuseTrainer’s public-domain `.mxl` catalog over the network (README parse + GitHub Pages, CORS `*`). Users want a second remote source without vendoring scores. [Arabesque](https://arabesque.app/) (`isc/arabesque`) publishes ~76 catalog rows (expanding to ~180 playable files when multi-part Hanon / folk sets are flattened) as JSON plus MusicXML / `.mxl` under `arabesque.app`, also with `Access-Control-Allow-Origin: *`.

## Decision

- **Browse Arabesque over the network** — fetch `https://arabesque.app/data/scores.json`, flatten top-level `file` entries and nested `parts[]` into `SampleScore` rows, load chosen files from `https://arabesque.app/scores/…`.
- **Do not vendor** the Arabesque repo or copy its score set into `public/samples/`.
- **No Worker proxy** — client `fetch` is enough (same CORS model as ADR 0005).
- Cache the parsed catalog in `sessionStorage` (`mm.arabesqueLibrary`) for the tab lifetime.
- Present MuseTrainer and Arabesque in **one Remote library** UI section: merge catalogs (source tag on each row), single search, independent fetch failures still allow the other source to show; Quick start samples stay bundled.

## Consequences

- Two remote catalogs can diverge or fail independently; a partial catalog is OK if only one source loads. Offline users still have Quick start and local file load.
- Catalog shape (including `parts` collections) tracks Arabesque; if they change JSON, the parser may need a tweak.
- Some Arabesque files are uncompressed `.xml` / `.musicxml` (not only `.mxl`); existing `readScoreFile` already handles both.
- Attribution to Arabesque belongs in the UI and docs; licensing remains their public-domain redistribution.
- Extends [ADR 0005](0005-musetrainer-remote-library.md); does not replace MuseTrainer.

## Code anchors

- `src/score/arabesqueLibrary.ts`
- `src/ui/LibraryBrowser.tsx`
- `src/score/museTrainerLibrary.ts` (peer)
