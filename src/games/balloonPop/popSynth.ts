const MASTER_GAIN = 0.28;

function midiToFreq(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Short balloon-pop SFX plus a soft root plink.
 * Lazily creates a persistent AudioContext.
 */
export class PopSynth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  async play(rootMidi: number): Promise<void> {
    const ctx = await this.ensureContext();
    if (!ctx || !this.master) return;

    const when = ctx.currentTime;
    this.playNoisePop(ctx, this.master, when);
    this.playPlink(ctx, this.master, when + 0.02, rootMidi);
  }

  dispose(): void {
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.master = null;
    }
  }

  private playNoisePop(ctx: AudioContext, master: GainNode, when: number): void {
    const duration = 0.12;
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(900, when);
    filter.frequency.exponentialRampToValueAtTime(180, when + duration);
    filter.Q.value = 0.7;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(1.1, when + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(when);
    src.stop(when + duration + 0.02);
  }

  private playPlink(
    ctx: AudioContext,
    master: GainNode,
    when: number,
    midi: number,
  ): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(midiToFreq(midi), when);
    osc.frequency.exponentialRampToValueAtTime(midiToFreq(midi) * 0.92, when + 0.18);

    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.55, when + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.22);

    osc.connect(gain);
    gain.connect(master);
    osc.start(when);
    osc.stop(when + 0.25);
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
