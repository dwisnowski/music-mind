# ADR 0005: MuseTrainer remote library

## Status

Accepted

## Context

Music Mind’s MVP ships a handful of bundled MusicXML / `.mxl` samples under `public/samples/` ([ADR 0001](0001-mvp-practice-architecture.md)). Users want the full [MuseTrainer public-domain library](https://github.com/musetrainer/library) (~69 scores) without cloning that repo into Music Mind or bloating the deploy with every file.

MuseTrainer publishes a GitHub Pages catalog (`musetrainer.github.io/library`) and a README list with display titles and Download URLs. Both the README and the `.mxl` assets respond with `Access-Control-Allow-Origin: *`, so a browser SPA can fetch them cross-origin.

## Decision

- **Browse MuseTrainer over the network** — parse their published README for title + Download URL at runtime; load chosen `.mxl` files from `https://musetrainer.github.io/library/scores/…`.
- **Do not vendor** the MuseTrainer repo or copy the full score set into `public/samples/`.
- **No Worker proxy** — client `fetch` is enough given CORS; scores still never upload to Music Mind (extends ADR 0001’s client-only score model).
- Cache the parsed catalog in `sessionStorage` for the tab lifetime.
- Keep the existing bundled samples as a short **Quick start** / offline path; the empty-state UI adds a searchable remote library list; the topbar opens that browser instead of a long `<select>`.

## Consequences

- Library browsing and remote score loads require network access; offline users still have Quick start samples and local file load.
- Catalog titles and file set track MuseTrainer’s README; if they change format, the parser may need a tweak.
- MusicXML quality still varies by source edition (same as ADR 0001); bad remotes fail at parse/load.
- Attribution to MuseTrainer belongs in the UI and docs; licensing remains their public-domain redistribution.
- A second remote peer (Arabesque) is documented in [ADR 0007](0007-arabesque-remote-library.md).

## Code anchors

- `src/score/museTrainerLibrary.ts`
- `src/ui/LibraryBrowser.tsx`
- `src/App.tsx` (empty state + topbar Library)
- `src/score/samples.ts` (bundled Quick start)
