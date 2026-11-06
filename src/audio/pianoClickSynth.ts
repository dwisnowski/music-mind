const CLICK_DURATION_SEC = 0.25;
const MASTER_GAIN = 0.22;

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Short polyphonic tones for on-screen piano clicks.
 * Lazily creates a persistent AudioContext; overlapping notes do not cut each other off.
 */
export class PianoClickSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  async play(midi: number): Promise<void> {
    const ctx = await this.ensureContext();
    if (!ctx || !this.master) return;

    const when = ctx.currentTime;
    const durationSec = CLICK_DURATION_SEC;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = midiToFreq(midi);

    const attack = 0.012;
    const release = Math.min(0.18, durationSec * 0.35);
    const peak = 0.9;
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(peak, when + attack);
    gain.gain.exponentialRampToValueAtTime(
      peak * 0.55,
      when + Math.max(attack, durationSec * 0.4),
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, when + durationSec + release);

    osc.connect(gain);
    gain.connect(this.master);
    osc.start(when);
    osc.stop(when + durationSec + release + 0.02);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }

  private async ensureContext(): Promise<AudioContext | null> {
    if (!this.ctx) {
      const ctx = new AudioContext();
      const master = ctx.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
    }
    if (this.ctx.state === "suspended") {
      await this.ctx.resume();
    }
    return this.ctx;
  }
}
