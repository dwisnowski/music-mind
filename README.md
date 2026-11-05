# Music Mind

Practice piano with interactive MusicXML, live MIDI feedback, and optional key lights — a [Wild Idea Zone](https://www.wildideazone.com/) project.

**Live:** [musicmind.wildideazone.com](https://musicmind.wildideazone.com) · [About this build](https://www.wildideazone.com/projects/music-mind)

## Features

- Load MusicXML / `.mxl` sheet music (local file or browse the remote [MuseTrainer](https://musetrainer.github.io/library/) public-domain library)
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

Then open Chrome at [http://localhost:5173](http://localhost:5173), allow MIDI, pair the piano (macOS: Audio MIDI Setup → Bluetooth), and load a score — **Quick start** samples (Für Elise, Clair de Lune, Gymnopédie No. 1, Twinkle) ship with the app; the empty-state **MuseTrainer library** browser loads the full public-domain catalog over the network without vendoring that repo.

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

## iPad (install on your device)

Needs a Mac with full Xcode and a free Apple ID — no paid Developer Program membership required.

```bash
make cap-sync
make cap-open
```

1. Connect the iPad (USB or wireless debugging) and unlock it; trust the computer if prompted.
2. In Xcode, open the **App** target → **Signing & Capabilities**.
3. Check **Automatically manage signing**, pick your personal **Team** (Add Account… with your Apple ID if needed).
4. Choose your iPad as the run destination, then press **Run** (▶).

After the first install, open **Music Mind** from the home screen anytime — the Mac is only needed to install or update. Free Apple IDs expire the signing profile about every **7 days**; if the app won’t launch, reconnect the iPad and Run again from Xcode.

On the iPad the first time: **Settings → General → VPN & Device Management** → trust your developer certificate if iOS asks.

Stock Safari/Chrome on iPad cannot use MIDI — use this app (or MIDIWeb Browser as an interim host for the website).

## Williams key lights

The LED protocol is undocumented. Settings → Key lights → sweep channels 1–16 while watching the LEDs (consider Local Off so outbound notes do not double-trigger sound). Practice channel plus separate **treble** and **bass** Listen channels are saved in `localStorage` (channel ≈ LED color). Listen lights treble/bass staff notes on those two channels; tapping the on-screen keyboard pulses one channel then cycles 0–15 for the next tap.
