# Docs

Architecture decisions and project notes for Music Mind.

## Architecture Decision Records

- [0001 – MVP practice architecture](adr/0001-mvp-practice-architecture.md) — Wild Idea Zone SPA; Feedback wait-for-me; MusicXML + OSMD; Web MIDI desktop + Capacitor CoreMIDI on iPad; key-light probe with on-screen keyboard fallback
- [0002 – Listen dual-channel key lights](adr/0002-listen-dual-channel-lights.md) — Listen drives Williams LEDs via Note On on staff-mapped treble/bass channels; click-to-cycle colors on the on-screen keyboard
- [0003 – Listen play/pause from practice](adr/0003-listen-play-pause-from-practice.md) — Dual cursors; Play/Pause remaining from practice index; score click seeks Listen or practice
- [0004 – Piano edge keys as app controls](adr/0004-piano-control-keys.md) — Toggleable control map on extreme keys; practice reset/step; Listen play-pause / next-10 / stop
- [0005 – MuseTrainer remote library](adr/0005-musetrainer-remote-library.md) — Browse/load MuseTrainer public-domain `.mxl` over the network (README catalog + GitHub Pages); keep bundled Quick start samples
- [0006 – Timed mini-games / Falling Lights](adr/0006-timed-falling-lights.md) — Separate timed lifecycle from Feedback; performance clock + MIDI timestamp offset; Falling Lights L/R fixed-key stage
- [0007 – Arabesque remote library](adr/0007-arabesque-remote-library.md) — Second remote catalog via Arabesque `scores.json` + `arabesque.app/scores/`; merged with MuseTrainer in one Remote library UI
- [0008 – Echo Ghost](adr/0008-echo-ghost.md) — Listen→echo mini-game; generated C4–B4 phrases; pitch-order grading (extends 0006)
- [0009 – Balloon Pop](adr/0009-balloon-pop.md) — Sky-pop mini-game; Easy/Medium/Hard; note/chord balloons; presence-window grading + hit SFX (extends 0006)
- [0010 – Listen player-piano MIDI](adr/0010-listen-player-piano-midi.md) — Speaker toggle sends timed MIDI Note On/Off so the piano sounds Listen; mute Web Audio; separate from key lights
- [0011 – Sheet music Write mode](adr/0011-sheet-music-write-mode.md) — Editable WriteDocument + OSMD; step/live entry; Simple/lyrics/Advanced UI; song-form templates; IndexedDB drafts; Listen + Open in Practice
- [0012 – Free Practice mode](adr/0012-free-practice-mode.md) — Genre scales/riffs as melodic helpers; Free scale map + Guided call-and-response; diatonic chords, live intervals, circle of fifths; Williams + on-screen lights
- [0013 – Home and Library pages](adr/0013-home-and-library-pages.md) — Dedicated `home` landing with particle wordmark; Library holds score browse/load; Games/Free Practice/Write mode group; Settings gear
