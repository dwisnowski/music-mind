import type { MidiAdapter } from "../midi/types";
import { PERFORMANCE_CHANNEL } from "../midi/midiNoteOutput";
import type { RawCaptureEvent } from "./quantize";
import { trimmedClipEvents, type WriteClip } from "./clipModel";

/**
 * Lightweight timed playback of a WriteClip (Web Audio + optional MIDI out / pedal CC).
 */
export class ClipPlayer {
  private timers: number[] = [];
  private audio: AudioContext | null = null;
  private playing = false;
  private onEnded: (() => void) | null = null;

  isPlaying() {
    return this.playing;
  }

  async play(
    clip: WriteClip,
    options?: {
      adapter?: MidiAdapter | null;
      onEnded?: () => void;
    },
  ): Promise<void> {
    this.stop();
    this.onEnded = options?.onEnded ?? null;
    const events = trimmedClipEvents(clip);
    if (!events.length) {
      this.onEnded?.();
      return;
    }

    const ctx = new AudioContext();
    this.audio = ctx;
    await ctx.resume();
    this.playing = true;

    const master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);

    const startAt = ctx.currentTime + 0.05;
    const adapter = options?.adapter ?? null;
    const channel = PERFORMANCE_CHANNEL;
    let lastEnd = startAt;

    const held = new Map<number, { stopAt: number; gain: GainNode; osc: OscillatorNode }>();

    for (const ev of events) {
      const when = startAt + ev.t;
      if (ev.kind === "cc") {
        const delay = Math.max(0, (when - ctx.currentTime) * 1000);
        this.timers.push(
          window.setTimeout(() => {
            adapter?.send([0xb0 | channel, ev.controller & 0x7f, ev.value & 0x7f]);
          }, delay),
        );
        continue;
      }

      if (ev.type === "on") {
        const vel = Math.max(1, Math.min(127, ev.velocity ?? 80));
        const gainVal = 0.04 + (vel / 127) * 0.22;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        osc.frequency.value = 440 * 2 ** ((ev.midi - 69) / 12);
        gain.gain.setValueAtTime(0.0001, when);
        gain.gain.exponentialRampToValueAtTime(gainVal, when + 0.01);
        osc.connect(gain);
        gain.connect(master);
        osc.start(when);
        held.set(ev.midi, { stopAt: when + 8, gain, osc });

        const delay = Math.max(0, (when - ctx.currentTime) * 1000);
        this.timers.push(
          window.setTimeout(() => {
            adapter?.send([0x90 | channel, ev.midi & 0x7f, vel]);
          }, delay),
        );
        lastEnd = Math.max(lastEnd, when + 0.3);
      } else {
        const delay = Math.max(0, (when - ctx.currentTime) * 1000);
        this.timers.push(
          window.setTimeout(() => {
            adapter?.send([0x80 | channel, ev.midi & 0x7f, 0]);
            const h = held.get(ev.midi);
            if (h && this.audio) {
              try {
                h.gain.gain.cancelScheduledValues(this.audio.currentTime);
                h.gain.gain.setValueAtTime(
                  Math.max(0.0001, h.gain.gain.value),
                  this.audio.currentTime,
                );
                h.gain.gain.exponentialRampToValueAtTime(0.0001, this.audio.currentTime + 0.05);
                h.osc.stop(this.audio.currentTime + 0.06);
              } catch {
                /* already stopped */
              }
              held.delete(ev.midi);
            }
          }, delay),
        );
        lastEnd = Math.max(lastEnd, when + 0.1);
      }
    }

    // Release any still-held notes at end of clip window
    const clipEnd = startAt + Math.max(clip.trimEndSec - clip.trimStartSec, 0.1);
    lastEnd = Math.max(lastEnd, clipEnd + 0.05);
    this.timers.push(
      window.setTimeout(() => {
        for (const midi of [...held.keys()]) {
          adapter?.send([0x80 | channel, midi & 0x7f, 0]);
        }
        // Pedal off
        adapter?.send([0xb0 | channel, 64, 0]);
        this.finish();
      }, Math.max(0, (lastEnd - ctx.currentTime) * 1000)),
    );
  }

  stop() {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
    void this.audio?.close();
    this.audio = null;
    this.playing = false;
  }

  private finish() {
    this.playing = false;
    void this.audio?.close();
    this.audio = null;
    this.onEnded?.();
    this.onEnded = null;
  }
}

/** Re-export for callers that only need the event list. */
export function eventsForAudition(clip: WriteClip): RawCaptureEvent[] {
  return trimmedClipEvents(clip);
}
