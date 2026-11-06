# Contributing to Music Mind

Thanks for wanting to help. Music Mind is a [Wild Idea Zone](https://www.wildideazone.com/) piano practice app: MusicXML scores, live MIDI feedback, mini-games, and optional key lights on supported instruments.

This guide is for **humans**. If you are an AI coding agent working in this repo, also read [`AGENTS.md`](./AGENTS.md).

## Ways to contribute

- Bug fixes and accessibility improvements
- Practice / Listen / Free Practice / Write mode polish
- Mini-game balance, UX, or new games that fit existing patterns
- MIDI / Bluetooth pairing reliability (desktop Web MIDI or iOS CoreMIDI)
- Docs, samples, and clearer empty states
- Small, focused refactors that make a real change easier

Prefer a short issue or draft PR description before large architecture shifts. Product and architecture choices live in [`docs/adr/`](./docs/adr/) — read those first so new work stays aligned.

## Prerequisites

| Need | Notes |
| --- | --- |
| Node.js | Current LTS (or recent Node 20+) |
| npm | Ships with Node; this repo uses the lockfile |
| Chrome or Edge | Desktop MIDI via Web MIDI |
| Optional: Bluetooth / USB MIDI keyboard | On-screen 88-key keyboard works without hardware |
| Optional: Mac + Xcode | Only for iPad / Capacitor changes |

You do **not** need Cloudflare credentials, Wrangler login, or an Apple Developer Program membership to try web changes locally.

## Getting started (local web)

```bash
git clone https://github.com/dwisnowski/music-mind.git
cd music-mind
make install
make run
```

Open [http://localhost:5173](http://localhost:5173) in Chrome or Edge.

1. Allow MIDI when the browser prompts (if you use a controller).
2. On macOS with Bluetooth MIDI: **Audio MIDI Setup → Bluetooth**, connect the piano, then Refresh → Connect in the app.
3. From **Library**, load a **Quick start** sample (Für Elise, Clair de Lune, Gymnopédie No. 1, Twinkle) or browse MuseTrainer / Arabesque over the network.

Override the port with `make run DEV_PORT=3000`.

### Make targets

| Target | What it does |
| --- | --- |
| `make install` | Install npm dependencies |
| `make run` | Vite + Worker dev server |
| `make build` | Production TypeScript + Vite build |
| `make lint` | oxlint |
| `make types` | Regenerate Wrangler / Worker types |
| `make cap-sync` | Build web assets and sync iOS Capacitor |
| `make cap-open` | Open the iOS project in Xcode |
| `make deploy` | Build and deploy (maintainers; needs `wrangler login`) |
| `make clean` | Remove `node_modules`, `dist`, `.wrangler` |

Equivalent npm scripts live in `package.json` if you prefer not to use Make.

## Try your change before opening a PR

There is no automated test suite yet. Before you push:

```bash
make lint
make build
```

Then exercise the path you touched in the running app (`make run`):

| Area | Smoke check |
| --- | --- |
| Feedback practice | Load a Quick start score → play expected notes (MIDI or on-screen keys) → cursor advances |
| Listen | Play / pause, seek by clicking the score; speaker / lights if you change those paths |
| Games | Falling Lights, Echo Ghost, or Balloon Pop from the Games entry points |
| Free Practice / Write | Open the mode, confirm load and a basic interaction still work |
| MIDI / piano family | Connect (or mock via on-screen keyboard); top-bar family label if relevant |
| Library | Quick start samples and at least one remote catalog load |
| UI / home | Home landing and navigation still reach Library / Practice |

If you change iOS or `plugins/core-midi`:

```bash
make cap-sync
make cap-open
```

Run on a connected iPad, pair MIDI from the in-app **Bluetooth MIDI…** sheet (not Settings → Bluetooth), and confirm notes reach the web layer. See the [iPad section in the README](./README.md#ipad-install-on-your-device) and [`ios/README.md`](./ios/README.md).

Stock Safari/Chrome on iPad cannot use MIDI — the Capacitor shell is the supported path.

## Pull requests

1. Fork (or branch) from `main`.
2. Keep the change focused — one concern per PR when practical.
3. Describe **what** changed and **how you verified** it (commands + manual smoke checks).
4. Link related ADRs or issues when the change extends a prior decision.
5. Do not commit secrets, local `.env` files, or generated junk (`node_modules`, `dist`, `.wrangler`).
6. Expect maintainers to deploy; contributors normally do not need `make deploy`.

### Architecture decisions

Meaningful product or architecture choices should become an ADR under `docs/adr/` (`NNNN-slug.md` with **Status**, **Context**, **Decision**, **Consequences**) and an index line in [`docs/README.md`](./docs/README.md). Prefer updating or extending an existing ADR when the change is incremental.

Wild Idea Zone branding (logo, footer, favicon, hub listing) must stay intact — see the project family conventions and the live hub page for [Music Mind](https://www.wildideazone.com/projects/music-mind).

## Code map (where to look)

| Path | Role |
| --- | --- |
| `src/App.tsx` | Top-level shell, routing between modes |
| `src/practice/` | Feedback / wait-for-me engine |
| `src/score/` | MusicXML load, timeline parse, remote libraries, samples |
| `src/midi/` | `MidiAdapter`, Web MIDI, Capacitor bridge, piano family |
| `src/lights/` | Williams key-light probe (gated by piano family) |
| `src/games/` | Falling Lights, Echo Ghost, Balloon Pop |
| `src/freePractice/`, `src/theory/` | Free Practice helpers and theory data |
| `src/write/` | Sheet Write mode |
| `src/ui/`, `src/home/` | Shared UI and home scene |
| `plugins/core-midi/` | Capacitor CoreMIDI + Bluetooth pairing |
| `ios/` | Capacitor iOS app |
| `worker/` | Cloudflare Worker (SPA assets + `/api/health`) |
| `docs/adr/` | Architecture Decision Records |

## Style and scope

- TypeScript + React 19; match existing naming and file layout.
- Prefer extending the shared `MidiAdapter` rather than adding parallel MIDI paths.
- Keep MusicXML as the score format; do not add PDF/OCR unless an ADR says so.
- Lint with oxlint (`make lint`); fix new lint errors in files you touch.
- Avoid drive-by refactors unrelated to the PR.
- Do not weaken Wild Idea Zone header/footer/favicon integration.

## License

By contributing, you agree that your contributions are licensed under the same [MIT License](./LICENSE) that covers this project.

## Questions

Open a GitHub issue with context (browser/OS, piano model if any, steps, expected vs actual). For design questions that change product direction, point at the relevant ADR or propose a new one in the PR.
