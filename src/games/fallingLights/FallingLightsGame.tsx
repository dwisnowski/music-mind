import { useEffect, useMemo, useRef, useState } from "react";
import { midiToName } from "../../midi/types";
import { accuracyPercent } from "../types";
import { DEFAULT_BPM } from "./constants";
import {
  FallingLightsEngine,
  type FallingLightsSnapshot,
  type FallingTarget,
} from "./engine";

interface FallingLightsGameProps {
  engine: FallingLightsEngine;
  onExit: () => void;
}

export function FallingLightsGame({ engine, onExit }: FallingLightsGameProps) {
  const [snap, setSnap] = useState<FallingLightsSnapshot>(() => engine.snapshot());
  const [bpm, setBpm] = useState(DEFAULT_BPM);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef(snap);

  useEffect(() => engine.subscribe((s) => {
    snapRef.current = s;
    setSnap(s);
  }), [engine]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;

    const draw = () => {
      const s = snapRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const w = Math.max(1, Math.floor(cssW * dpr));
      const h = Math.max(1, Math.floor(cssH * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.clearRect(0, 0, cssW, cssH);

      // Atmosphere
      const grad = ctx.createLinearGradient(0, 0, 0, cssH);
      grad.addColorStop(0, "#0b1220");
      grad.addColorStop(1, "#1a2438");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, cssW, cssH);

      const laneX = { left: cssW * 0.32, right: cssW * 0.68 };
      const judgeY = cssH * 0.78;
      const spawnY = cssH * 0.08;

      // Lane guides
      for (const lane of ["left", "right"] as const) {
        ctx.strokeStyle = lane === "left" ? "rgba(79, 163, 255, 0.35)" : "rgba(255, 120, 160, 0.35)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(laneX[lane], spawnY);
        ctx.lineTo(laneX[lane], judgeY + 24);
        ctx.stroke();
      }

      // Judgment line
      ctx.strokeStyle = "rgba(255, 236, 180, 0.85)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cssW * 0.12, judgeY);
      ctx.lineTo(cssW * 0.88, judgeY);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 236, 180, 0.7)";
      ctx.font = "600 12px DM Sans, sans-serif";
      ctx.fillText("HIT", cssW * 0.12, judgeY - 8);

      const now = performance.now();
      if (s.phase === "countdown" || s.phase === "playing") {
        for (const t of s.targets) {
          drawTarget(ctx, t, s, now, laneX, spawnY, judgeY);
        }
      }

      if (s.lastFlash && now - s.lastFlash.atPerf < 280) {
        const x = laneX[s.lastFlash.lane];
        const color =
          s.lastFlash.grade === "perfect"
            ? "#7dffb0"
            : s.lastFlash.grade === "good"
              ? "#ffe08a"
              : "#ff7a7a";
        ctx.fillStyle = color;
        ctx.globalAlpha = 1 - (now - s.lastFlash.atPerf) / 280;
        ctx.beginPath();
        ctx.arc(x, judgeY, 28, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.font = "700 14px DM Sans, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(s.lastFlash.grade.toUpperCase(), x, judgeY - 36);
        ctx.textAlign = "left";
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const leftName = useMemo(() => midiToName(snap.homeKeys.left), [snap.homeKeys.left]);
  const rightName = useMemo(() => midiToName(snap.homeKeys.right), [snap.homeKeys.right]);
  const active = snap.phase === "countdown" || snap.phase === "playing";
  const acc = accuracyPercent(snap.score);

  return (
    <div className="falling-lights">
      <div className="falling-lights-bar">
        <div className="falling-lights-titles">
          <h2>Falling Lights</h2>
          <p>
            Hit <strong className="lane-left">{leftName}</strong> (left) and{" "}
            <strong className="lane-right">{rightName}</strong> (right) as orbs cross the line.
          </p>
        </div>
        <div className="falling-lights-actions">
          <label className="field inline">
            <span>BPM</span>
            <input
              type="number"
              min={40}
              max={200}
              value={bpm}
              disabled={active}
              onChange={(e) => setBpm(Math.min(200, Math.max(40, Number(e.target.value) || DEFAULT_BPM)))}
            />
          </label>
          {snap.phase === "idle" || snap.phase === "finished" ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => engine.start(bpm)}
            >
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

      <div className="falling-lights-stage">
        <canvas ref={canvasRef} className="falling-lights-canvas" aria-label="Falling Lights stage" />
        {snap.phase === "countdown" ? (
          <div className="falling-lights-overlay count" aria-live="polite">
            {snap.countInBeat}
          </div>
        ) : null}
        {snap.phase === "idle" ? (
          <div className="falling-lights-overlay idle">
            <p>Connect MIDI (or tap C3 / C5 on the keyboard), then Start.</p>
          </div>
        ) : null}
        {snap.phase === "finished" ? (
          <div className="falling-lights-overlay results" role="status">
            <h3>Run complete</h3>
            <p className="falling-lights-acc">{acc}%</p>
            <ul>
              <li>Perfect {snap.score.perfect}</li>
              <li>Good {snap.score.good}</li>
              <li>Miss {snap.score.miss}</li>
              <li>Max combo {snap.score.maxCombo}</li>
            </ul>
          </div>
        ) : null}
      </div>

      <div className="falling-lights-hud" aria-live="polite">
        <span>Hits {snap.score.hits}/{snap.score.total || "—"}</span>
        <span>Combo {snap.score.combo}</span>
        <span className="lane-left">LH {leftName}</span>
        <span className="lane-right">RH {rightName}</span>
      </div>
    </div>
  );
}

function drawTarget(
  ctx: CanvasRenderingContext2D,
  t: FallingTarget,
  s: FallingLightsSnapshot,
  now: number,
  laneX: { left: number; right: number },
  spawnY: number,
  judgeY: number,
) {
  if (t.judged && t.result === "miss") {
    // brief fade already handled by flash; skip lingering miss orbs past window
  }
  if (t.judged) return;

  const travel = s.fallDurationMs;
  const progress = 1 - (t.hitTimePerf - now) / travel;
  if (progress < -0.05 || progress > 1.35) return;

  const y = spawnY + (judgeY - spawnY) * Math.min(1.15, Math.max(-0.05, progress));
  const x = laneX[t.lane];
  const color = t.lane === "left" ? "#4fa3ff" : "#ff78a0";

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  ctx.beginPath();
  ctx.arc(x - 4, y - 4, 4, 0, Math.PI * 2);
  ctx.fill();
}
