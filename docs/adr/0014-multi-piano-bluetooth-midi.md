# ADR 0014: Multi-piano Bluetooth MIDI (Williams + Roland FP-60X)

## Status

Accepted

## Context

Music Mind was designed around a **Williams Symphony Grand II** with Bluetooth MIDI and empirical key lights ([ADR 0001](0001-mvp-practice-architecture.md), [ADR 0002](0002-listen-dual-channel-lights.md)). Practice, games, Write, Free Practice, control keys, and Listen player-piano already use standard Note On/Off, so another Bluetooth MIDI piano can drive the app once paired.

A cousin’s **Roland FP-60X** needs the same practice path. Gaps that blocked that safely:

- Connect always wired the chosen input to `outputs[0]`, which can be the wrong destination when multiple MIDI endpoints are listed.
- Connection copy assumed Williams menu paths; Roland pairs as **`FP-60X MIDI`** via the in-app Bluetooth MIDI sheet (not iOS Settings → Bluetooth).
- A saved Williams `noteOn` light profile could emit low-velocity Note Ons to a non-Williams output and sound or confuse MIDI In on the Roland.
- Connection state lived only inside Settings, so users could not see which piano family was active at a glance.

## Decision

- Support **Williams Symphony Grand II** (primary; key lights) and **Roland FP-60X** (standard Bluetooth MIDI; on-screen hints only) as first-class families, with a generic fallback for other controllers.
- Detect family from the connected input display name; prefer Williams when auto-picking among multiple devices.
- Connect UI selects **input and output independently**, defaulting output to the same display name as the input.
- Keep the Williams light protocol and `music-mind-light-profile` shape unchanged; **gate physical light MIDI by connected family** so non-Williams devices never receive light Note Ons even if the saved profile is `noteOn`.
- Show MIDI connection state and piano family in the sticky top bar (opens Settings on tap).

## Consequences

- Roland users get Feedback / games / Write / Free Practice / Listen player-piano without Williams LED probes.
- Shared browsers no longer send Williams light probes to a Roland output while a non-Williams piano is connected.
- Top-bar family labels depend on MIDI endpoint names (`FP-60X MIDI`, Williams/Symphony strings); unknown names show as generic MIDI piano.
- Extends [ADR 0001](0001-mvp-practice-architecture.md) device story without adopting Roland SysEx or changing [ADR 0010](0010-listen-player-piano-midi.md) performance MIDI.

## Code anchors

- `src/midi/pianoFamily.ts`
- `src/midi/webMidiAdapter.ts`
- `src/ui/ConnectPanel.tsx`
- `src/lights/williamsLights.ts`
- `src/ui/LightsPanel.tsx`
- `src/App.tsx` (top-bar MIDI indicator, connect pairing)
