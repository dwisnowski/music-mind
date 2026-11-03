import type { MidiAdapter } from "../midi/types";

export type LightMode = "off" | "noteOn";

export interface LightProfile {
  mode: LightMode;
  /** 0–15 MIDI channel for outbound Note On lights */
  channel: number;
  velocity: number;
}

const STORAGE_KEY = "music-mind-light-profile";

export const DEFAULT_LIGHT_PROFILE: LightProfile = {
  mode: "off",
  channel: 0,
  velocity: 1,
};

export function loadLightProfile(): LightProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_LIGHT_PROFILE };
    return { ...DEFAULT_LIGHT_PROFILE, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_LIGHT_PROFILE };
  }
}

export function saveLightProfile(profile: LightProfile) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

export class WilliamsLights {
  private profile: LightProfile;
  private lit = new Set<number>();
  private adapter: MidiAdapter | null = null;

  constructor(profile: LightProfile = loadLightProfile()) {
    this.profile = profile;
  }

  setAdapter(adapter: MidiAdapter | null) {
    this.clear();
    this.adapter = adapter;
  }

  getProfile() {
    return this.profile;
  }

  setProfile(profile: LightProfile) {
    this.clear();
    this.profile = profile;
    saveLightProfile(profile);
  }

  /** Light exactly these MIDI notes (expected keys). */
  setExpected(notes: Iterable<number>) {
    const next = new Set(notes);
    for (const n of this.lit) {
      if (!next.has(n)) this.noteOff(n);
    }
    for (const n of next) {
      if (!this.lit.has(n)) this.noteOn(n);
    }
  }

  clear() {
    for (const n of [...this.lit]) this.noteOff(n);
  }

  /**
   * Probe helper: pulse middle C on a channel.
   * Watch the piano LEDs while Local/volume is managed by the player.
   */
  pulseProbe(note = 60, channel = this.profile.channel, ms = 400) {
    if (!this.adapter) return;
    const statusOn = 0x90 | (channel & 0x0f);
    const statusOff = 0x80 | (channel & 0x0f);
    this.adapter.send([statusOn, note, this.profile.velocity || 1]);
    window.setTimeout(() => {
      this.adapter?.send([statusOff, note, 0]);
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

  private noteOn(note: number) {
    if (this.profile.mode === "off" || !this.adapter) return;
    const status = 0x90 | (this.profile.channel & 0x0f);
    this.adapter.send([status, note & 0x7f, this.profile.velocity || 1]);
    this.lit.add(note);
  }

  private noteOff(note: number) {
    if (!this.adapter) {
      this.lit.delete(note);
      return;
    }
    const status = 0x80 | (this.profile.channel & 0x0f);
    this.adapter.send([status, note & 0x7f, 0]);
    this.lit.delete(note);
  }
}
