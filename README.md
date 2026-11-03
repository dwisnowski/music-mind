# Music Mind

Practice piano with interactive MusicXML, live MIDI feedback, and optional key lights — a [Wild Idea Zone](https://www.wildideazone.com/) project.

**Live:** [musicmind.wildideazone.com](https://musicmind.wildideazone.com) · [About this build](https://www.wildideazone.com/projects/music-mind)

## Features

- Load MusicXML / `.mxl` sheet music
- Simply Piano–style **Feedback** mode: wait-for-correct-notes, vertical cursor, color feedback
- On-screen 88-key hint keyboard
- Web MIDI on desktop (Chrome / Edge)
- iPad via Capacitor + CoreMIDI (Bluetooth MIDI pairing)
- Williams Symphony Grand II key-light probe (Note On channel sweep)

## Develop

```bash
make install
make run
```

Then open Chrome at [http://localhost:5173](http://localhost:5173), allow MIDI, pair the piano (macOS: Audio MIDI Setup → Bluetooth), and load a score (or click **Try sample**).

| Target | What it does |
| --- | --- |
| `make install` | Install npm dependencies |
| `make run` | Vite + Worker dev server (port 5173) |
| `make build` | Production build |
| `make deploy` | Build and deploy to Cloudflare |
| `make lint` | Run oxlint |
| `make types` | Regenerate Wrangler types |
| `make cap-sync` | Build + sync the iOS Capacitor project |
| `make cap-open` | Open the iOS project in Xcode |
| `make clean` | Remove `node_modules`, `dist`, and `.wrangler` |

Override the dev port with `make run DEV_PORT=3000`.

## Deploy (web)

```bash
make deploy
```

Custom domain: `musicmind.wildideazone.com` (Cloudflare Workers). Needs `wrangler login` once.

## iPad (TestFlight)

```bash
make cap-sync
make cap-open
```

In Xcode: set your Apple Team, then run on a connected iPad or Archive → TestFlight.

Stock Safari/Chrome on iPad cannot use MIDI — use this app (or MIDIWeb Browser as an interim host for the website).

## Williams key lights

The LED protocol is undocumented. Settings → Key lights → sweep channels 1–16 while watching the LEDs (consider Local Off so outbound notes do not double-trigger sound). Working channel is saved in `localStorage`.
