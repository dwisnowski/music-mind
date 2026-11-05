# ADR 0002: Listen dual-channel key lights

## Status

Accepted

## Context

Music Mind’s Williams Symphony Grand II key lights respond to ordinary MIDI Note On/Off; channel selects LED color (empirical, undocumented). Practice hints already light expected keys on a single saved channel. Listen mode played the score through Web Audio and highlighted the on-screen keyboard, but never drove the piano LEDs. Listen always plays both hands, so a single color cannot distinguish treble vs bass.

Score notes already carry `staffIndex` (`0` = treble/RH, `≥1` = bass/LH on a typical grand staff).

## Decision

- During Listen, send timed Note On/Off for each sounding note, using **trebleChannel** for `staffIndex === 0` and **bassChannel** for `staffIndex ≥ 1`.
- Persist both channels (plus the existing practice `channel`) in the light profile (`localStorage`).
- Track lit LEDs as `(channel, note)` so two colors can coexist and Note Off targets the correct channel.
- On-screen keyboard taps pulse one channel then cycle 0–15 for the next tap (session-only cycle index; does not rewrite saved practice channel).
- Suppress practice `setExpected` lighting while Listen is active; clear lights on Listen start/stop/end and score reload.

## Consequences

- Users must probe/sweep channels to pick treble vs bass colors; the mapping is hardware-specific and not documented by Williams.
- Staff index approximates clef on grand-staff MusicXML; cross-staff or multi-part scores may mis-color keys.
- Click-to-cycle is a convenient probe for discovering colors without changing Listen settings.
- Extends [ADR 0001](0001-mvp-practice-architecture.md) probe approach without adopting SysEx.

## Code anchors

- `src/lights/williamsLights.ts`
- `src/audio/scorePlayer.ts`
- `src/App.tsx` (Listen `onNote`, click cycle)
- `src/ui/LightsPanel.tsx`
