import type { MidiAdapter } from "../midi/types";

export type LightMode = "off" | "noteOn";

export interface LightProfile {
  mode: LightMode;
  /** 0–15 MIDI channel for practice hints / probe default */
  channel: number;
  /** 0–15 MIDI channel for treble/staff-0 Listen lights (color) */
  trebleChannel: number;
  /** 0–15 MIDI channel for bass/staff≥1 Listen lights (color) */
  bassChannel: number;
  velocity: number;
}

const STORAGE_KEY = "music-mind-light-profile";

export const DEFAULT_LIGHT_PROFILE: LightProfile = {
  mode: "off",
  channel: 0,
  trebleChannel: 0,
  bassChannel: 0,
  velocity: 1,
};

function clampChannel(n: unknown, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.trunc(n) : fallback;
  return Math.min(15, Math.max(0, v));
}

export function loadLightProfile(): LightProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LIGHT_PROFILE };
    const parsed = JSON.parse(raw) as Partial<LightProfile>;
    const channel = clampChannel(parsed.channel, DEFAULT_LIGHT_PROFILE.channel);
    return {
      ...DEFAULT_LIGHT_PROFILE,
      ...parsed,
      channel,
      trebleChannel: clampChannel(parsed.trebleChannel, channel),
      bassChannel: clampChannel(parsed.bassChannel, channel),
      velocity:
        typeof parsed.velocity === "number" && Number.isFinite(parsed.velocity)
          ? parsed.velocity
          : DEFAULT_LIGHT_PROFILE.velocity,
      mode: parsed.mode === "noteOn" ? "noteOn" : "off",
    };
  } catch {
    return { ...DEFAULT_LIGHT_PROFILE };
  }
}

export function saveLightProfile(profile: LightProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function litKey(channel: number, note: number): string {
  return `${channel & 0x0f}:${note & 0x7f}`;
}

function parseLitKey(key: string): { channel: number; note: number } {
  const [ch, n] = key.split(":");
  return { channel: Number(ch), note: Number(n) };
}

export class WilliamsLights {
  private profile: LightProfile;
  /** Active lights keyed as "channel:note" */
  private lit = new Set<string>();
  private adapter: MidiAdapter | null = null;
  /** When false, do not emit light MIDI (non-Williams pianos). Profile stays unchanged. */
  private deviceLightsEnabled = true;

  constructor(profile: LightProfile = loadLightProfile()) {
    this.profile = profile;
  }

  setAdapter(adapter: MidiAdapter | null) {
    this.clear();
    this.adapter = adapter;
  }

  /**
   * Gate physical LED Note Ons for the connected piano family.
   * Williams stays enabled; Roland/generic never receive light MIDI.
   */
  setDeviceLightsEnabled(enabled: boolean) {
    if (this.deviceLightsEnabled === enabled) return;
    if (!enabled) this.clear();
    this.deviceLightsEnabled = enabled;
  }

  getDeviceLightsEnabled() {
    return this.deviceLightsEnabled;
  }

  getProfile() {
    return this.profile;
  }

  setProfile(profile: LightProfile) {
    this.clear();
    this.profile = profile;
    saveLightProfile(profile);
  }

  /** Light exactly these MIDI notes on the practice channel (expected keys). */
  setExpected(notes: Iterable<number>) {
    const channel = this.profile.channel;
    const next = new Set([...notes].map((n) => litKey(channel, n)));
    for (const key of this.lit) {
      if (!next.has(key)) {
        const { channel: ch, note } = parseLitKey(key);
        this.sendNoteOff(ch, note);
        this.lit.delete(key);
      }
    }
    for (const key of next) {
      if (!this.lit.has(key)) {
        const { channel: ch, note } = parseLitKey(key);
        this.sendNoteOn(ch, note);
        this.lit.add(key);
      }
    }
  }

  /**
   * Timed Listen / click light on an explicit channel.
   * When turning off, only clears this (channel, note) pair.
   */
  lightNote(midi: number, on: boolean, channel: number) {
    if (on) {
      if (this.profile.mode === "off" || !this.adapter) return;
      const key = litKey(channel, midi);
      if (this.lit.has(key)) return;
      this.sendNoteOn(channel, midi);
      this.lit.add(key);
    } else {
      const key = litKey(channel, midi);
      if (!this.lit.has(key)) return;
      this.sendNoteOff(channel, midi);
      this.lit.delete(key);
    }
  }

  clear() {
    for (const key of [...this.lit]) {
      const { channel, note } = parseLitKey(key);
      this.sendNoteOff(channel, note);
      this.lit.delete(key);
    }
  }

  /**
   * Probe helper: pulse a note on a channel.
   * Watch the piano LEDs while Local/volume is managed by the player.
   */
  pulseProbe(note = 60, channel = this.profile.channel, ms = 400) {
    if (!this.adapter || !this.deviceLightsEnabled) return;
    const statusOn = 0x90 | (channel & 0x0f);
    const statusOff = 0x80 | (channel & 0x0f);
    this.adapter.send([statusOn, note & 0x7f, this.profile.velocity || 1]);
    window.setTimeout(() => {
      this.adapter?.send([statusOff, note & 0x7f, 0]);
    }, ms);
  }

  probeAllChannels(note = 60) {
    let ch = 0;
    const step = () => {
      if (ch > 15) return;
      this.pulseProbe(note, ch, 350);
      ch += 1;
      window.setTimeout(step, 450);
    };
    step();
  }

  private sendNoteOn(channel: number, note: number) {
    if (this.profile.mode === "off" || !this.adapter || !this.deviceLightsEnabled) return;
    const status = 0x90 | (channel & 0x0f);
    this.adapter.send([status, note & 0x7f, this.profile.velocity || 1]);
  }

  private sendNoteOff(channel: number, note: number) {
    if (!this.adapter || !this.deviceLightsEnabled) return;
    const status = 0x80 | (channel & 0x0f);
    this.adapter.send([status, note & 0x7f, 0]);
  }
}
