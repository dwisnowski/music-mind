import { useEffect, useRef, useState } from "react";
import { accuracyPercent } from "../types";
import {
  BALLOON_COLORS,
  DEFAULT_DIFFICULTY,
  DIFFICULTY_LABELS,
  type Difficulty,
} from "./constants";
import {
  BalloonPopEngine,
  type BalloonPopSnapshot,
  type BalloonTarget,
} from "./engine";
import { PopSynth } from "./popSynth";

interface BalloonPopGameProps {
  engine: BalloonPopEngine;
  onExit: () => void;
  soundEnabled: boolean;
}

export function BalloonPopGame({ engine, onExit, soundEnabled }: BalloonPopGameProps) {
  const [snap, setSnap] = useState<BalloonPopSnapshot>(() => engine.snapshot());
  const [difficulty, setDifficulty] = useState<Difficulty>(DEFAULT_DIFFICULTY);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const snapRef = useRef(snap);
  const synthRef = useRef(new PopSynth());
  const lastPopAtRef = useRef(0);
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    const synth = synthRef.current;
    return () => synth.dispose();
  }, []);

  useEffect(
    () =>
      engine.subscribe((s) => {
        snapRef.current = s;
        setSnap(s);
        if (s.lastPop && s.lastPop.atPerf !== lastPopAtRef.current) {
          lastPopAtRef.current = s.lastPop.atPerf;
          if (soundEnabledRef.current) {
            void synthRef.current.play(s.lastPop.rootMidi);
          }
        }
      }),
    [engine],
  );

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

      drawSky(ctx, cssW, cssH);

      const now = performance.now();
      if (s.phase === "countdown" || s.phase === "playing" || s.phase === "finished") {
        for (const b of s.balloons) {
          drawBalloon(ctx, b, now, cssW, cssH);
        }
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const active = snap.phase === "countdown" || snap.phase === "playing";
  const acc = accuracyPercent(snap.score);

  return (
    <div className="balloon-pop">
      <div className="balloon-pop-bar">
        <div className="balloon-pop-titles">
          <h2>Balloon Pop</h2>
          <p>Play the note or chord on each balloon before it floats away.</p>
        </div>
        <div className="balloon-pop-actions">
          <div
            className="balloon-pop-difficulty"
            role="group"
            aria-label="Difficulty"
          >
            {(["easy", "medium", "hard"] as const).map((d) => (
              <button
                key={d}
                type="button"
                className={`btn${difficulty === d ? " primary" : ""}`}
                disabled={active}
                aria-pressed={difficulty === d}
                onClick={() => setDifficulty(d)}
              >
                {DIFFICULTY_LABELS[d]}
              </button>
            ))}
          </div>
          {snap.phase === "idle" || snap.phase === "finished" ? (
            <button
              type="button"
              className="btn primary"
              onClick={() => engine.start(difficulty)}
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

      <div className="balloon-pop-stage">
        <canvas
          ref={canvasRef}
          className="balloon-pop-canvas"
          aria-label="Balloon Pop stage"
        />
        {snap.phase === "countdown" ? (
          <div className="balloon-pop-overlay count" aria-live="polite">
            {snap.countInBeat}
          </div>
        ) : null}
        {snap.phase === "idle" ? (
          <div className="balloon-pop-overlay idle">
            <p>Pick a difficulty, then Start. Pop balloons with matching keys or chords.</p>
          </div>
        ) : null}
        {snap.phase === "finished" ? (
          <div className="balloon-pop-overlay results" role="status">
            <h3>Sky cleared</h3>
            <p className="balloon-pop-diff">{DIFFICULTY_LABELS[snap.difficulty]}</p>
            <p className="balloon-pop-acc">{acc}%</p>
            <ul>
              <li>Hits {snap.score.hits}</li>
              <li>Miss {snap.score.miss}</li>
              <li>Max combo {snap.score.maxCombo}</li>
            </ul>
          </div>
        ) : null}
      </div>

      <div className="balloon-pop-hud" aria-live="polite">
        <span>
          Hits {snap.score.hits}/{snap.score.total || "—"}
        </span>
        <span>Combo {snap.score.combo}</span>
        <span>{DIFFICULTY_LABELS[snap.difficulty]}</span>
      </div>
    </div>
  );
}

function drawSky(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, "#7ec8ff");
  grad.addColorStop(0.55, "#b8e4ff");
  grad.addColorStop(1, "#e8f6ff");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Soft clouds
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  drawCloud(ctx, w * 0.15, h * 0.18, 46);
  drawCloud(ctx, w * 0.55, h * 0.12, 58);
  drawCloud(ctx, w * 0.82, h * 0.22, 40);
  drawCloud(ctx, w * 0.35, h * 0.28, 36);

  // Ground strip
  const ground = ctx.createLinearGradient(0, h * 0.82, 0, h);
  ground.addColorStop(0, "#8fd18a");
  ground.addColorStop(1, "#5fad5a");
  ctx.fillStyle = ground;
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
}

function drawCloud(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
  ctx.arc(x + r * 0.55, y - r * 0.15, r * 0.7, 0, Math.PI * 2);
  ctx.arc(x + r * 1.1, y, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawBalloon(
  ctx: CanvasRenderingContext2D,
  b: BalloonTarget,
  now: number,
  w: number,
  h: number,
): void {
  if (b.state === "pending" || b.state === "missed") return;
  if (b.state === "falling" && now - b.popPerf > 900) return;

  const color = BALLOON_COLORS[b.colorIndex % BALLOON_COLORS.length]!;
  let x: number;
  let y: number;
  let scale = 1;
  let alpha = 1;

  if (b.state === "flying") {
    const progress = Math.min(1, Math.max(0, (now - b.spawnPerf) / b.flyDurationMs));
    x = w * (-0.08 + progress * 1.16);
    y = h * b.band + Math.sin(progress * Math.PI * 2.2 + b.colorIndex) * h * 0.04;
  } else if (b.state === "popping") {
    const progress = Math.min(1, (now - b.spawnPerf) / b.flyDurationMs);
    x = w * (-0.08 + progress * 1.16);
    y = h * b.band + Math.sin(progress * Math.PI * 2.2 + b.colorIndex) * h * 0.04;
    const popT = Math.min(1, (now - b.popPerf) / 120);
    scale = 1 + popT * 0.45;
    alpha = 1 - popT * 0.35;
    drawBurst(ctx, x, y, color, popT);
  } else {
    // falling after pop
    const progress = Math.min(1, (now - b.spawnPerf) / b.flyDurationMs);
    const baseX = w * (-0.08 + progress * 1.16);
    const baseY = h * b.band + Math.sin(progress * Math.PI * 2.2 + b.colorIndex) * h * 0.04;
    const fallT = (now - b.popPerf) / 900;
    x = baseX + fallT * 18;
    y = baseY + fallT * fallT * h * 0.55;
    scale = Math.max(0.2, 1 - fallT * 0.5);
    alpha = Math.max(0, 1 - fallT);
    drawBurst(ctx, baseX, baseY, color, Math.min(1, fallT * 2));
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // String
  ctx.strokeStyle = "rgba(80,60,40,0.45)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 28);
  ctx.quadraticCurveTo(6, 48, -2, 68);
  ctx.stroke();

  // Balloon body
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, 26, 32, 0, 0, Math.PI * 2);
  ctx.fill();

  // Highlight
  ctx.fillStyle = "rgba(255,255,255,0.45)";
  ctx.beginPath();
  ctx.ellipse(-8, -10, 7, 10, -0.4, 0, Math.PI * 2);
  ctx.fill();

  // Knot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-5, 30);
  ctx.lineTo(0, 38);
  ctx.lineTo(5, 30);
  ctx.closePath();
  ctx.fill();

  // Label
  ctx.fillStyle = "rgba(20,30,40,0.9)";
  ctx.font = `700 ${b.kind === "chord" ? 22 : 20}px "DM Sans", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(b.label, 0, 2);

  ctx.restore();
}

function drawBurst(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  t: number,
): void {
  if (t <= 0 || t >= 1) return;
  ctx.save();
  ctx.globalAlpha = 1 - t;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  const n = 8;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2;
    const dist = 12 + t * 36;
    const px = x + Math.cos(ang) * dist;
    const py = y + Math.sin(ang) * dist;
    ctx.beginPath();
    ctx.arc(px, py, 3 * (1 - t * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
