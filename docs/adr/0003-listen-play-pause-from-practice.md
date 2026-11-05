# ADR 0003: Listen play/pause from practice with dual cursors

## Status

Accepted

## Context

Listen previously always played the full score from the start and reused the single OSMD cursor, so the practice (Feedback) position disappeared while listening. Users need to hear the **remaining** music from the practice spot, pause/resume without losing place, keep the blue practice cursor fixed, and seek either cursor by clicking the score.

## Decision

- Listen transport is `idle | playing | paused`, independent of Feedback.
- **Play** from idle starts at `feedback.eventIndex` (remaining score). **Pause** stops audio and keeps the amber Listen cursor. **Resume** continues from `listenEventIndex`. **Stop** clears Listen only.
- Two OSMD cursors: practice blue (`#2f6fed`) always tracks Feedback; Listen amber (`#c98512`) tracks `listenEventIndex` while playing or paused.
- ScorePlayer accepts `startEventIndex` and schedules relative to that event’s timestamp (event-granular pause/resume).
- MIDI / on-screen practice input is gated while Listen is not idle so Feedback does not advance under Listen.
- Score clicks: idle → seek practice; playing/paused → seek Listen; Shift+click → practice; Alt/Option+click → Listen (idle becomes paused at click). `FeedbackEngine.seek` jumps practice without rewriting grades.

## Consequences

- Users can preview ahead without losing practice place; Listen no longer implies “from measure 1” unless practice is at the start.
- OSMD click hit-testing and timestamp mapping (whole notes → quarters) may miss on dense or multi-page layouts; Shift/Alt modifiers need discovery via tooltip.
- Extends [ADR 0002](0002-listen-dual-channel-lights.md) Listen lighting for remaining-from-index playback.

## Code anchors

- `src/audio/scorePlayer.ts`
- `src/practice/feedbackEngine.ts` (`seek`)
- `src/ui/ScoreView.tsx`
- `src/App.tsx`
