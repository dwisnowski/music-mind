import { useEffect, useState } from "react";
import { midiToName } from "../../midi/types";
import { accuracyPercent } from "../types";
import { DEFAULT_BPM } from "./constants";
import { EchoGhostEngine, type EchoGhostSnapshot } from "./engine";

interface EchoGhostGameProps {
  engine: EchoGhostEngine;
  onExit: () => void;
}

export function EchoGhostGame({ engine, onExit }: EchoGhostGameProps) {
  const [snap, setSnap] = useState<EchoGhostSnapshot>(() => engine.snapshot());
  const [bpm, setBpm] = useState(DEFAULT_BPM);

  useEffect(() => engine.subscribe(setSnap), [engine]);

  const active =
    snap.phase === "listening" ||
    snap.phase === "echoing" ||
    snap.phase === "roundResult";
  const acc = accuracyPercent(snap.score);

  return (
    <div className="echo-ghost">
      <div className="echo-ghost-bar">
        <div className="echo-ghost-titles">
          <h2>Echo Ghost</h2>
          <p>Listen to the phrase, then replay the pitches in order (timing is free).</p>
        </div>
        <div className="echo-ghost-actions">
          <label className="field inline">
            <span>BPM</span>
            <input
              type="number"
              min={40}
              max={200}
              value={bpm}
              disabled={active}
              onChange={(e) =>
                setBpm(Math.min(200, Math.max(40, Number(e.target.value) || DEFAULT_BPM)))
              }
            />
          </label>
          {snap.phase === "idle" || snap.phase === "finished" ? (
            <button type="button" className="btn primary" onClick={() => engine.start(bpm)}>
              {snap.phase === "finished" ? "Play again" : "Start"}
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => engine.stop()}>
              Stop
            </button>
          )}
          <button type="button" className="btn ghost" onClick={onExit}>
            Exit
          </button>
        </div>
      </div>

      <div className="echo-ghost-stage">
        {snap.phase === "idle" ? (
          <div className="echo-ghost-banner idle">
            <p>Connect MIDI or tap C4–B4 white keys, then Start.</p>
          </div>
        ) : null}

        {snap.phase === "listening" ? (
          <div className="echo-ghost-banner listen" aria-live="polite">
            <span className="echo-ghost-phase">Listen</span>
            <span className="echo-ghost-round">
              Round {snap.roundIndex + 1} / {snap.roundCount}
            </span>
          </div>
        ) : null}

        {snap.phase === "echoing" ? (
          <div className="echo-ghost-banner echo" aria-live="polite">
            <span className="echo-ghost-phase">Your turn</span>
            <span className="echo-ghost-round">
              Round {snap.roundIndex + 1} / {snap.roundCount}
            </span>
          </div>
        ) : null}

        {snap.phase === "roundResult" ? (
          <div className="echo-ghost-banner result" aria-live="polite">
            <span className="echo-ghost-phase">Round done</span>
            <span>
              {snap.lastRoundHits} hit · {snap.lastRoundMisses} miss
            </span>
          </div>
        ) : null}

        {snap.phase === "finished" ? (
          <div className="echo-ghost-banner results" role="status">
            <h3>Session complete</h3>
            <p className="echo-ghost-acc">{acc}%</p>
            <ul>
              <li>Hits {snap.score.hits}</li>
              <li>Miss {snap.score.miss}</li>
              <li>Max combo {snap.score.maxCombo}</li>
            </ul>
          </div>
        ) : null}

        {snap.expected.length > 0 && snap.phase !== "idle" && snap.phase !== "finished" ? (
          <div className="echo-ghost-dots" aria-label="Phrase progress">
            {snap.expected.map((midi, i) => {
              const result = snap.results[i] ?? "pending";
              const current = snap.phase === "echoing" && i === snap.cursor;
              const isGhostSlot = snap.phase === "listening" && i === snap.listenIndex;
              return (
                <div
                  key={`${i}-${midi}`}
                  className={`echo-ghost-dot ${result}${current ? " current" : ""}${isGhostSlot ? " ghost" : ""}`}
                  title={result !== "pending" || isGhostSlot ? midiToName(midi) : undefined}
                >
                  {result === "pending"
                    ? isGhostSlot
                      ? midiToName(midi)
                      : "·"
                    : result === "hit"
                      ? "✓"
                      : "✗"}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>

      <div className="echo-ghost-hud" aria-live="polite">
        <span>
          Hits {snap.score.hits}/{snap.score.total || "—"}
        </span>
        <span>Combo {snap.score.combo}</span>
        <span>
          Round {Math.min(snap.roundIndex + 1, snap.roundCount)}/{snap.roundCount}
        </span>
      </div>
    </div>
  );
}
