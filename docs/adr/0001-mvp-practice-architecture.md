# ADR 0001: MVP practice architecture (MIDI Feedback, MusicXML, iPad Capacitor)

## Status

Accepted (implemented: Vite/React SPA on Cloudflare Workers at `musicmind.wildideazone.com`, wait-for-me Feedback engine, MusicXML/MXL load + OSMD render, shared `MidiAdapter` with Web MIDI + Capacitor CoreMIDI, Williams key-light probe, Wild Idea Zone hub listing).

## Context

Music Mind is a Wild Idea Zone practice tool for a **Williams Symphony Grand II** with Bluetooth MIDI and multi-color key lights. The product goal is a Simply Piano PLAY → **Feedback** loop: traditional sheet music, a vertical cursor, live note matching, and hint feedback — not a full lesson curriculum.

Constraints that shaped the design:

- Stock **iOS/iPadOS Safari** (and every other iPad browser, which uses WebKit) does **not** implement the Web MIDI API, so opening the hosted URL in Safari cannot talk to the piano.
- The piano’s key lights are marketed for educational apps (e.g. Skoove), but the **LED protocol is undocumented** (MIDI chart recognizes SysEx without documenting LED commands).
- Bluetooth audio and Bluetooth MIDI **cannot run at once** on this instrument.
- Scores should stay on-device for MVP; there is no account or cloud library requirement.

## Decision

- **Host as a Wild Idea Zone SPA** at `musicmind.wildideazone.com` (Vite + React + TypeScript, Cloudflare Workers via `@cloudflare/vite-plugin` + Wrangler), with WIZ logo, footer, favicon, and hub listing.
- **MVP practice mode is Feedback / wait-for-me only.** Advance when the expected pitch set is played (chords wait for all notes); no timed/metronome “moving stage” grading yet. Match **MIDI only** — no microphone pitch detection in MVP.
- **Sheet input is MusicXML / compressed `.mxl` only** (no PDF/OCR). Render with OpenSheetMusicDisplay; build the practice timeline from a lightweight MusicXML pitch parser so matching does not depend on OSMD’s internal note model.
- **One `MidiAdapter` interface, two backends:** Web MIDI on desktop Chrome/Edge; Capacitor iOS + CoreMIDI (with Bluetooth MIDI pairing UI) for iPad as a first-class device. Feature-detect and explain MIDIWeb Browser as an interim iPad host for the website. Do **not** treat stock Safari as a MIDI path.
- **On-screen 88-key keyboard is the reliable hint surface.** Physical Williams LEDs are behind a pluggable probe (`noteOn` channel sweep / future SysEx), persisted in `localStorage` when a channel works; Local Off may be required so outbound Note On does not also trigger sound.
- **Client-only scores for v1** — files stay in the browser; the Worker serves the SPA (and a small health API), not uploaded libraries.
- **iPad UX is landscape / music-stand first.** TestFlight via Capacitor is enough for personal use; App Store polish is out of scope for MVP.

## Consequences

- Desktop practice works in Chrome/Edge after OS Bluetooth MIDI (or USB) pairing; Safari on macOS remains unsupported for MIDI without extensions.
- iPad practice requires the native Capacitor shell (or a third-party Web MIDI browser). Shipping and signing that app is an ongoing Xcode/TestFlight cost.
- Wait-for-me is forgiving on timing and chord order, but does not train tempo; a later moving-stage mode would be a separate decision.
- MusicXML quality varies by exporter; bad files fail at parse/load rather than silently mismatching.
- Key lights may never respond to outbound MIDI on this hardware; the product still works with the on-screen keyboard, and the probe settings make that gap explicit.
- Bundle size is dominated by OSMD; acceptable for MVP, but may need code-splitting later.
- Code anchors: `src/midi/`, `src/practice/feedbackEngine.ts`, `src/score/`, `src/lights/williamsLights.ts`, `plugins/core-midi/`, `ios/`, `wrangler.jsonc`.
