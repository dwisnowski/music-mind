/** Monotonic game clock based on performance.now(), with optional MIDI timestamp sync. */
export class GameClock {
  private midiToPerfOffset: number | null = null;
  private startedAtPerf = 0;
  private running = false;

  start(atPerf = performance.now()): void {
    this.startedAtPerf = atPerf;
    this.midiToPerfOffset = null;
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** Elapsed ms since start(). */
  elapsed(nowPerf = performance.now()): number {
    if (!this.running) return 0;
    return Math.max(0, nowPerf - this.startedAtPerf);
  }

  nowPerf(): number {
    return performance.now();
  }

  /**
   * Map a MIDI adapter timestamp onto performance.now() space.
   * First call in a session locks the offset; later notes reuse it.
   */
  toPerf(midiTimestamp: number | undefined, fallbackPerf = performance.now()): number {
    if (midiTimestamp == null || !Number.isFinite(midiTimestamp)) {
      return fallbackPerf;
    }
    if (this.midiToPerfOffset == null) {
      this.midiToPerfOffset = fallbackPerf - midiTimestamp;
    }
    return midiTimestamp + this.midiToPerfOffset;
  }

  startedAt(): number {
    return this.startedAtPerf;
  }
}
