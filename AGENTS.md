# Agent notes — Music Mind

Short orientation for AI coding agents. Humans should start with [`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`README.md`](./README.md).

## What this is

Vite + React + TypeScript SPA for piano practice, deployed on Cloudflare Workers at `musicmind.wildideazone.com`. Desktop MIDI uses Web MIDI (Chrome/Edge). iPad MIDI uses Capacitor + `plugins/core-midi` (CoreMIDI / Bluetooth pairing). Scores are MusicXML / `.mxl` only.

## Read before changing architecture

1. [`docs/README.md`](./docs/README.md) — ADR index  
2. Relevant files under [`docs/adr/`](./docs/adr/)  
3. Workspace rules under [`.cursor/rules/`](./.cursor/rules/) (ADRs for architecture plans; Wild Idea Zone branding)

When a change records a product or architecture decision: add/update `docs/adr/NNNN-slug.md` (**Status**, **Context**, **Decision**, **Consequences**) and update the index in `docs/README.md`. Do not treat `.cursor/plans/` as project documentation.

## Repo map

| Path | Role |
| --- | --- |
| `src/App.tsx` | Mode shell / navigation |
| `src/practice/feedbackEngine.ts` | Wait-for-me Feedback matching |
| `src/score/` | Load/parse MusicXML, remote MuseTrainer + Arabesque, bundled samples |
| `src/midi/` | `MidiAdapter`, Web MIDI, Capacitor adapter, `pianoFamily` |
| `src/lights/williamsLights.ts` | Key lights — **Williams family only** |
| `src/games/` | Timed mini-games (shared clock/judgment patterns) |
| `src/freePractice/`, `src/theory/` | Free Practice |
| `src/write/` | Write mode + OSMD editing |
| `src/ui/`, `src/home/` | UI chrome, home particle scene |
| `plugins/core-midi/` | Native MIDI plugin |
| `ios/` | Capacitor iOS project |
| `worker/` | Worker fetch handler; SPA via assets; `/api/health` |
| `Makefile` | Canonical local commands |

## Non-negotiables

- Preserve Wild Idea Zone logo, favicon, footer credit, and `og:site_name`.
- One MIDI abstraction (`MidiAdapter`); do not invent a second stack.
- Gate physical key-light emission by piano family (Williams); Roland and others use on-screen hints.
- Do not treat stock iPad Safari as a MIDI path.
- Do not vendor MuseTrainer/Arabesque score trees; remote catalog fetch is intentional.
- No accounts / cloud user library in current architecture (client-side scores + remote public catalogs).
- Prefer MIT-compatible, small diffs; avoid unrelated refactors.

## Local verify (required before claiming done)

```bash
make install   # if deps missing
make lint
make build
make run       # manual smoke of the touched flow
```

There is **no** unit/e2e suite. After code changes, describe the manual smoke you expect a human (or browser) to run. Typical checks: load Quick start sample → Feedback advances on correct pitches; Listen play/pause; one game if games touched; Library remote load if library touched.

iOS / plugin changes: `make cap-sync` then Xcode on device; pair via in-app Bluetooth MIDI sheet.

Do **not** `make deploy` unless the user explicitly asks. Do **not** commit unless asked.

## Implementation tips

- Match existing TypeScript / React patterns in the nearest sibling files.
- Large mode UIs often live beside engines (`*Workspace.tsx` + engine module).
- Settings and MIDI connection UX tend to live under `src/ui/` and `src/App.tsx`.
- `localStorage` holds light channels and similar preferences — keep keys stable or migrate intentionally.
- Lint: oxlint via `make lint`. Types: `tsc -b` is part of `make build`.

## PR / handoff checklist for agents

- [ ] Change matches an existing ADR or includes a new/updated ADR when the decision is architectural
- [ ] `make lint` and `make build` succeed
- [ ] Manual verification notes for the touched surface
- [ ] WIZ branding untouched
- [ ] No secrets, no `dist` / `.wrangler` / `node_modules` in the diff
