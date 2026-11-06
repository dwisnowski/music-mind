# ADR 0010: Listen player-piano MIDI sound

## Status

Accepted

## Context

Listen mode already schedules the score with Web Audio oscillators ([ADR 0002](0002-listen-dual-channel-lights.md), [ADR 0003](0003-listen-play-pause-from-practice.md)) and can drive Williams key lights via low-velocity Note On/Off on staff-mapped channels. Users want Listen to optionally make the physical piano sound — a player-piano path where the computer is the score and MIDI Out hammers the keys.

Light Note Ons intentionally use velocity ~1 and often require Local Off so LEDs do not also trigger acoustic sound ([ADR 0001](0001-mvp-practice-architecture.md)). Performance sound needs a separate MIDI stream (standard voice channel, musical velocity) that does not share light state lifetime.

## Decision

- Add a **speaker toggle** on the Listen bar (`mm.listenMidiSound`, default off).
- When enabled during Listen, send timed performance MIDI Note On/Off on **channel 0** at velocity **~80** via the existing `MidiAdapter` output, tracked independently of `WilliamsLights`.
- Mute Listen Web Audio (`ScorePlayer` `muteAudio`) while this mode is on so the piano — not laptop speakers — is the sound source. Timing and `onNote` callbacks stay on the AudioContext clock.
- On Listen stop / pause / end, send Note Off for all active performance notes (and CC 123 All Notes Off) without clearing light state separately from the existing light clear paths.
- Lights continue unchanged when the light profile mode is `noteOn`.

## Consequences

- With Local Off, MIDI In still drives the sound engine on typical digital pianos, so player-piano works alongside LED lighting. If MIDI In does not sound on a given setup, that is a piano Local/MIDI setting issue.
- Dual Note On streams (lights + performance) may soft-trigger on some firmware if Local On and light channels also feed the voice engine; users who already use Local Off for lights are unaffected.
- Extends Listen transport from [ADR 0003](0003-listen-play-pause-from-practice.md) without changing Feedback or dock click-sound (`mm.pianoClickSound`).

## Code anchors

- `src/midi/midiNoteOutput.ts`
- `src/audio/scorePlayer.ts` (`muteAudio`)
- `src/App.tsx` (Listen bar toggle, `onNote` performance sends)
