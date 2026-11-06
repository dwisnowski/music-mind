import type { MidiAdapter } from "./types";

/** Standard voice channel (MIDI channel 1). */
export const PERFORMANCE_CHANNEL = 0;

/** Musical velocity for player-piano Listen (not light-probe velocity). */
export const PERFORMANCE_VELOCITY = 80;

/**
 * Tracks performance Note On/Off sent during Listen so stop/pause can
 * release sounding keys without touching WilliamsLights state.
 */
export class MidiNoteOutput {
  private active = new Set<number>();
  private channel: number;
  private velocity: number;

  constructor(
    channel = PERFORMANCE_CHANNEL,
    velocity = PERFORMANCE_VELOCITY,
  ) {
    this.channel = channel & 0x0f;
    this.velocity = Math.min(127, Math.max(1, Math.trunc(velocity)));
  }

  noteOn(adapter: MidiAdapter | null, note: number) {
    if (!adapter) return;
    const n = note & 0x7f;
    adapter.send([0x90 | this.channel, n, this.velocity]);
    this.active.add(n);
  }

  noteOff(adapter: MidiAdapter | null, note: number) {
    if (!adapter) return;
    const n = note & 0x7f;
    if (!this.active.has(n)) return;
    adapter.send([0x80 | this.channel, n, 0]);
    this.active.delete(n);
  }

  /** Release every tracked note and send CC 123 All Notes Off. */
  allNotesOff(adapter: MidiAdapter | null) {
    if (!adapter) {
      this.active.clear();
      return;
    }
    for (const n of [...this.active]) {
      adapter.send([0x80 | this.channel, n, 0]);
    }
    this.active.clear();
    adapter.send([0xb0 | this.channel, 123, 0]);
  }
}
