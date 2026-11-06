import { animate, createTimer, eases, spring, stagger, utils } from "animejs";
import type { JSAnimation, Timer } from "animejs";

export interface MusicMindPalette {
  ink: string;
  accent: string;
  wood: string;
  hint: string;
}

export interface MusicMindSceneOptions {
  width: number;
  palette: MusicMindPalette;
  playIntro: boolean;
  reducedMotion: boolean;
}

export interface MusicMindScene {
  setPalette(palette: MusicMindPalette): void;
  dispose(): void;
}

const FONT_STACK = '"Fraunces", "Source Serif 4", Georgia, serif';
const font = (size: number) => `600 ${size}px ${FONT_STACK}`;
const LETTER_SPACING_EM = -0.02;
const TAU = Math.PI * 2;

interface Target {
  x: number;
  y: number;
  /** -1 regular, 0 first M, 1 second M */
  letter: number;
}

interface Particle {
  x: number;
  y: number;
  size: number;
  gold: number;
  px: number;
  py: number;
  letter: number;
  wx: number;
  wy: number;
  tx: number;
  ty: number;
  ox: number;
  oy: number;
  vx: number;
  vy: number;
  hue: number;
  phase: number;
  twinkle: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  size: number;
  flare: boolean;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  alpha: number;
  push: number;
}

const perParticle = (fn: (p: Particle) => number) => (target: unknown) => fn(target as Particle);

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mixColors(a: string, b: string, steps: number): string[] {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  return Array.from({ length: steps }, (_, i) => {
    const t = steps === 1 ? 0 : i / (steps - 1);
    const c = ca.map((v, k) => Math.round(v + (cb[k] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  });
}

function createGlowSprite(): HTMLCanvasElement {
  const sprite = document.createElement("canvas");
  sprite.width = sprite.height = 64;
  const g = sprite.getContext("2d")!;
  const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, "rgba(255, 190, 40, 0.9)");
  gradient.addColorStop(0.3, "rgba(201, 133, 18, 0.35)");
  gradient.addColorStop(1, "rgba(255, 170, 0, 0)");
  g.fillStyle = gradient;
  g.fillRect(0, 0, 64, 64);
  return sprite;
}

function buildColors(palette: MusicMindPalette) {
  return {
    base: mixColors(palette.ink, palette.accent, 32),
    gold: mixColors(palette.wood, palette.hint, 8),
    glint: "#ffffff",
    ring: palette.hint,
    glow: createGlowSprite(),
  };
}

function rasterize(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  draw(ctx);
  return ctx.getImageData(0, 0, width, height);
}

interface LetterBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function sample(img: ImageData, step: number, goldBoxes: LetterBox[] = []): Target[] {
  const out: Target[] = [];
  let row = 0;
  for (let y = step / 2; y < img.height; y += step, row++) {
    for (let x = (row % 2 ? step / 2 : 0) + step / 4; x < img.width; x += step) {
      const i = ((y | 0) * img.width + (x | 0)) * 4;
      if (img.data[i + 3] < 128) continue;
      let letter = -1;
      if (img.data[i + 1] > img.data[i]) {
        letter = goldBoxes.findIndex((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
      }
      out.push({ x, y, letter });
    }
  }
  return out;
}

interface Layout {
  width: number;
  height: number;
  fontSize: number;
  step: number;
  radius: number;
  phrase: Target[];
  mono: Target[];
  monoScale: number;
  staff: Target[];
}

function drawStaff(ctx: CanvasRenderingContext2D, width: number, height: number, fontSize: number) {
  const midY = height * 0.52;
  const gap = Math.max(8, fontSize * 0.14);
  const left = width * 0.18;
  const right = width * 0.82;
  ctx.strokeStyle = "#ff0000";
  ctx.lineWidth = Math.max(2, fontSize * 0.035);
  ctx.lineCap = "round";
  for (let i = -2; i <= 2; i++) {
    const y = midY + i * gap;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(right, y);
    ctx.stroke();
  }
  const noteR = gap * 0.42;
  const noteXs = [0.28, 0.4, 0.52, 0.64, 0.74].map((t) => width * t);
  const noteYs = [-1.5, -0.5, 0.5, 1.2, -0.2].map((n) => midY + n * gap);
  ctx.fillStyle = "#ff0000";
  noteXs.forEach((x, i) => {
    const y = noteYs[i];
    ctx.beginPath();
    ctx.ellipse(x, y, noteR * 1.35, noteR, -0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + noteR * 1.2, y);
    ctx.lineTo(x + noteR * 1.2, y - gap * 2.4);
    ctx.lineWidth = Math.max(2, fontSize * 0.04);
    ctx.stroke();
  });
}

function computeLayout(width: number): Layout {
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font(100);
  const lines = width >= 520 ? ["Music Mind"] : ["Music", "Mind"];
  const lineWidthAt100 = (line: string) =>
    measure.measureText(line).width + LETTER_SPACING_EM * 100 * (line.length - 1);
  const padX = 8;
  const fontSize = Math.min(132, ((width - padX * 2) / Math.max(...lines.map(lineWidthAt100))) * 100);

  measure.font = font(fontSize);
  const ascent = measure.measureText("Music").actualBoundingBoxAscent;
  const gap = fontSize * 0.2;
  const padTop = fontSize * 0.4;
  const padBottom = fontSize * 0.35;
  const height = Math.ceil(padTop + lines.length * ascent + (lines.length - 1) * gap + padBottom);
  const step = Math.min(5.5, Math.max(2.6, fontSize / 24));

  const goldBoxes: LetterBox[] = [];
  let goldLetter = 0;
  const phraseImg = rasterize(width, height, (ctx) => {
    ctx.font = font(fontSize);
    lines.forEach((line, li) => {
      const baseline = padTop + ascent + li * (ascent + gap);
      [...line].forEach((char, ci) => {
        if (char === " ") return;
        const x =
          padX + ctx.measureText(line.slice(0, ci)).width + LETTER_SPACING_EM * fontSize * ci;
        const isGold = ci === 0 || line[ci - 1] === " ";
        if (isGold) {
          const w = ctx.measureText(char).width;
          goldBoxes.push({
            x0: x - 2,
            x1: x + w + 2,
            y0: baseline - ascent - 4,
            y1: baseline + 4,
          });
          goldLetter += 1;
        }
        ctx.fillStyle = isGold ? "#00ff00" : "#ff0000";
        ctx.fillText(char, x, baseline);
      });
    });
  });
  void goldLetter;
  const phrase = sample(phraseImg, step, goldBoxes);

  const monoImg = rasterize(width, height, (ctx) => {
    ctx.font = font(100);
    const capAt100 = ctx.measureText("M").actualBoundingBoxAscent;
    const spacing = 0.12;
    const widthAt100 = ctx.measureText("MM").width + spacing * 100;
    const size = Math.min((height * 0.82 * 100) / capAt100, (width * 0.72 * 100) / widthAt100);
    ctx.font = font(size);
    const cap = (capAt100 * size) / 100;
    const total = ctx.measureText("MM").width + spacing * size;
    let x = (width - total) / 2;
    ctx.fillStyle = "#00ff00";
    for (const char of "MM") {
      ctx.fillText(char, x, height / 2 + cap / 2);
      x += ctx.measureText(char).width + spacing * size;
    }
  });
  let monoStep = step;
  let mono = sample(monoImg, monoStep);
  while (mono.length > phrase.length) {
    monoStep += 0.2;
    mono = sample(monoImg, monoStep);
  }

  const staffImg = rasterize(width, height, (ctx) => drawStaff(ctx, width, height, fontSize));
  let staffStep = step;
  let staff = sample(staffImg, staffStep);
  while (staff.length > phrase.length * 1.15) {
    staffStep += 0.25;
    staff = sample(staffImg, staffStep);
  }
  if (staff.length < phrase.length * 0.55) {
    staffStep = Math.max(2.2, step - 0.8);
    staff = sample(staffImg, staffStep);
  }

  return {
    width,
    height,
    fontSize,
    step,
    radius: step * 0.42,
    phrase,
    mono,
    monoScale: Math.min(1.8, monoStep / step),
    staff,
  };
}

function createParticles(layout: Layout): Particle[] {
  const { phrase, mono, width, staff } = layout;
  const particles: Particle[] = phrase.map((t) => ({
    x: t.x,
    y: t.y,
    size: 1,
    gold: t.letter >= 0 ? 1 : 0,
    px: t.x,
    py: t.y,
    letter: t.letter,
    wx: t.x,
    wy: t.y,
    tx: t.x,
    ty: t.y,
    ox: 0,
    oy: 0,
    vx: 0,
    vy: 0,
    hue: Math.min(31, Math.max(0, Math.round((t.x / width) * 31))),
    phase: Math.random() * TAU,
    twinkle: utils.random(0.002, 0.009, 4),
  }));

  const ranked = [...particles].sort((a, b) => a.px - b.px || a.py - b.py);
  const monoSorted = [...mono].sort((a, b) => a.x - b.x || a.y - b.y);
  const staffSorted = [...staff].sort((a, b) => a.x - b.x || a.y - b.y);

  ranked.forEach((p, r) => {
    const w = monoSorted[Math.floor((r * monoSorted.length) / ranked.length)];
    p.wx = w.x + utils.random(-0.6, 0.6, 2);
    p.wy = w.y + utils.random(-0.6, 0.6, 2);

    const s = staffSorted[Math.floor((r * staffSorted.length) / ranked.length)] ?? staffSorted[0];
    p.tx = s.x + utils.random(-0.8, 0.8, 2);
    p.ty = s.y + utils.random(-0.8, 0.8, 2);
  });

  return particles;
}

export function createMusicMindScene(
  canvas: HTMLCanvasElement,
  options: MusicMindSceneOptions,
): MusicMindScene {
  const layout = computeLayout(options.width);
  const { width, height, radius, fontSize } = layout;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d")!;

  const particles = createParticles(layout);
  const sparks: Spark[] = [];
  const rings: Ring[] = [];
  const goldPool: Particle[] = [];
  const glint = { x: -1e4, width: fontSize * 0.9 };
  const pointer = { x: 0, y: 0, active: false };
  const state = { sparkRate: 0.0016 };
  let colors = buildColors(options.palette);
  let alive = true;

  const running = new Set<JSAnimation | Timer>();
  const track = <T extends JSAnimation | Timer>(tickable: T): T => {
    running.add(tickable);
    tickable.then(() => running.delete(tickable));
    return tickable;
  };
  const wait = (ms: number) =>
    new Promise<void>((resolve) => track(createTimer({ duration: ms, onComplete: () => resolve() })));

  const spawnSpark = (x: number, y: number, burstPower = 0) => {
    if (sparks.length > 450) return;
    const flare = !burstPower && Math.random() < 0.22;
    const angle = Math.random() * TAU;
    const speed = burstPower ? utils.random(1, burstPower, 2) : 0;
    sparks.push({
      x,
      y,
      vx: burstPower ? Math.cos(angle) * speed : flare ? 0 : utils.random(-0.25, 0.25, 2),
      vy: burstPower ? Math.sin(angle) * speed : flare ? 0 : utils.random(-0.9, -0.2, 2),
      life: 1,
      decay: flare ? utils.random(0.03, 0.05, 3) : utils.random(0.012, 0.026, 3),
      size: flare ? radius * utils.random(3.5, 5.5, 1) : radius * utils.random(1.2, 2.8, 1),
      flare,
    });
  };

  const burst = (x: number, y: number, count: number, power = 5) => {
    for (let i = 0; i < count; i++) spawnSpark(x, y, power);
  };

  const shockwave = (x: number, y: number, reach: number, push = 1.4) => {
    const ring: Ring = { x, y, r: 0, alpha: 1, push };
    rings.push(ring);
    track(
      animate(ring, {
        r: reach,
        alpha: 0,
        duration: 1100,
        ease: "outExpo",
        onComplete: () => rings.splice(rings.indexOf(ring), 1),
      }),
    );
  };

  const centroid = (group: Particle[]) => {
    const sum = group.reduce((acc, p) => ({ x: acc.x + p.px, y: acc.y + p.py }), { x: 0, y: 0 });
    return { x: sum.x / group.length, y: sum.y / group.length };
  };

  const star = (x: number, y: number, s: number) => {
    ctx.moveTo(x, y - s);
    ctx.quadraticCurveTo(x, y, x + s, y);
    ctx.quadraticCurveTo(x, y, x, y + s);
    ctx.quadraticCurveTo(x, y, x - s, y);
    ctx.quadraticCurveTo(x, y, x, y - s);
  };

  const stepPhysics = (dt: number) => {
    const iterations = Math.min(3, Math.max(1, Math.round(dt / 16.7)));
    const reach = fontSize * 0.55;
    const reach2 = reach * reach;
    goldPool.length = 0;

    for (const p of particles) {
      for (let i = 0; i < iterations; i++) {
        const x = p.x + p.ox;
        const y = p.y + p.oy;
        if (pointer.active) {
          const dx = x - pointer.x;
          const dy = y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < reach2 && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const force = (1 - d / reach) * 1.5;
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }
        for (const ring of rings) {
          const dx = x - ring.x;
          const dy = y - ring.y;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          const band = Math.abs(d - ring.r);
          if (band < 16) {
            const force = ring.push * ring.alpha * (1 - band / 16);
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }
        p.vx = (p.vx - p.ox * 0.07) * 0.85;
        p.vy = (p.vy - p.oy * 0.07) * 0.85;
        p.ox += p.vx;
        p.oy += p.vy;
      }
      if (p.gold > 0.8 && p.size > 0.5) goldPool.push(p);
    }

    let spawns = goldPool.length * state.sparkRate * iterations;
    while (spawns > 0 && goldPool.length) {
      if (Math.random() < spawns) {
        const p = goldPool[(Math.random() * goldPool.length) | 0];
        spawnSpark(p.x + p.ox, p.y + p.oy);
      }
      spawns -= 1;
    }

    for (let i = sparks.length - 1; i >= 0; i--) {
      const s = sparks[i];
      s.x += s.vx * iterations;
      s.y += s.vy * iterations;
      s.vx *= 0.96;
      s.vy = s.vy * 0.96 - 0.012 * iterations;
      s.life -= s.decay * iterations;
      if (s.life <= 0) sparks.splice(i, 1);
    }
  };

  const draw = (time: number) => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const glintActive = glint.x > -glint.width && glint.x < width + glint.width;

    for (const p of particles) {
      if (p.gold < 0.02 || p.size < 0.05) continue;
      const tw = 0.5 + 0.5 * Math.sin(time * p.twinkle + p.phase);
      const g = radius * p.size * (3.2 + tw * 1.6);
      ctx.globalAlpha = p.gold * 0.16 * (0.5 + tw * 0.5);
      ctx.drawImage(colors.glow, p.x + p.ox - g, p.y + p.oy - g, g * 2, g * 2);
    }

    for (const p of particles) {
      if (p.size < 0.05) continue;
      const x = p.x + p.ox + Math.sin(time * 0.0013 + p.phase) * 0.35;
      const y = p.y + p.oy + Math.cos(time * 0.0011 + p.phase) * 0.35;
      const lit = glintActive ? Math.max(0, 1 - Math.abs(x - glint.x) / glint.width) : 0;
      const r = radius * p.size * (1 + lit * 0.45);

      if (p.gold < 0.98) {
        ctx.globalAlpha = 1 - p.gold;
        ctx.fillStyle = colors.base[p.hue];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
      }
      if (p.gold > 0.02) {
        const tw = 0.5 + 0.5 * Math.sin(time * p.twinkle + p.phase);
        ctx.globalAlpha = p.gold;
        ctx.fillStyle = colors.gold[Math.min(7, (tw * 8) | 0)];
        ctx.beginPath();
        ctx.arc(x, y, r * (0.85 + tw * 0.3), 0, TAU);
        ctx.fill();
      }
      if (lit > 0.05) {
        ctx.globalAlpha = lit * 0.75;
        ctx.fillStyle = colors.glint;
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, 0, TAU);
        ctx.fill();
      }
    }

    ctx.fillStyle = colors.gold[7];
    for (const s of sparks) {
      ctx.globalAlpha = Math.min(1, s.life * 1.4);
      ctx.beginPath();
      star(s.x, s.y, s.size * (s.flare ? Math.sin(s.life * Math.PI) : s.life));
      ctx.fill();
    }

    ctx.strokeStyle = colors.ring;
    for (const ring of rings) {
      ctx.globalAlpha = ring.alpha * 0.8;
      ctx.lineWidth = 0.5 + ring.alpha * 2.5;
      ctx.beginPath();
      ctx.arc(ring.x, ring.y, ring.r, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  if (options.reducedMotion) {
    for (const p of particles) {
      p.x = p.px;
      p.y = p.py;
      p.size = 1;
      p.gold = p.letter >= 0 ? 1 : 0;
    }
    draw(0);
    return {
      setPalette(palette) {
        options.palette = palette;
        colors = buildColors(palette);
        draw(0);
      },
      dispose() {},
    };
  }

  let last = 0;
  const loop = createTimer({
    onUpdate: (self) => {
      const now = self.currentTime;
      stepPhysics(Math.min(50, now - last));
      last = now;
      draw(now);
    },
  });

  const visibility = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) loop.resume();
    else loop.pause();
  });
  visibility.observe(canvas);

  const toLocal = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * width,
      y: ((e.clientY - rect.top) / rect.height) * height,
    };
  };
  const onMove = (e: PointerEvent) => {
    Object.assign(pointer, toLocal(e), { active: true });
    if (Math.random() < 0.35) {
      const near = goldPool.find(
        (p) => Math.hypot(p.x + p.ox - pointer.x, p.y + p.oy - pointer.y) < fontSize * 0.4,
      );
      if (near) spawnSpark(near.x + near.ox, near.y + near.oy);
    }
  };
  const onLeave = () => {
    pointer.active = false;
  };
  const onDown = (e: PointerEvent) => {
    const { x, y } = toLocal(e);
    shockwave(x, y, fontSize * 1.6, 2.2);
    burst(x, y, 22, 4);
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("pointercancel", onLeave);
  canvas.addEventListener("pointerdown", onDown);

  const bouncy = spring({ mass: 1, stiffness: 90, damping: 9 });

  const formStaff = async () => {
    for (const p of particles) {
      p.x = p.tx;
      p.y = p.ty;
      p.size = 0;
      p.gold = 0;
    }
    await track(
      animate(particles, {
        size: 0.9,
        duration: 280,
        ease: eases.outBack(2.4),
        delay: perParticle((p) => (p.tx / width) * 520 + utils.random(0, 80)),
      }),
    );
  };

  const decode = async () => {
    for (const p of particles) {
      p.vy -= utils.random(2, 7, 2);
      p.vx += utils.random(-2, 2, 2);
    }
    track(
      animate(particles, {
        x: perParticle((p) => p.px),
        y: perParticle((p) => p.py),
        size: 1,
        ease: bouncy,
        delay: perParticle((p) => (p.px / width) * 420 + utils.random(0, 160)),
      }),
    );
    await wait(900);
  };

  const ignite = async () => {
    for (let letter = 0; letter < 2; letter++) {
      const group = particles.filter((p) => p.letter === letter);
      if (!group.length) continue;
      const c = centroid(group);
      shockwave(c.x, c.y, fontSize * 1.1);
      burst(c.x, c.y, 24, 5);
      track(
        animate(group, {
          gold: { to: 1, duration: 260, ease: "outQuad" },
          size: [
            { to: 2.0, duration: 140, ease: "outQuad" },
            { to: 1, duration: 800, ease: eases.outElastic(1, 0.4) },
          ],
          delay: stagger([0, 200], { from: "center" }),
        }),
      );
      await wait(360);
    }
  };

  const startGlint = () => {
    track(
      animate(glint, {
        x: [-glint.width, width + glint.width],
        duration: 1900,
        ease: "inOutSine",
        loop: true,
        loopDelay: 3600,
      }),
    );
  };

  const toMono = async () => {
    const cx = width / 2;
    shockwave(cx, height / 2, width * 0.5, 0.8);
    track(
      animate(particles, {
        gold: 1,
        duration: 700,
        ease: "outQuad",
        delay: perParticle((p) => (Math.abs(p.px - cx) / width) * 900),
      }),
    );
    state.sparkRate = 0.0035;
    await track(
      animate(particles, {
        x: perParticle((p) => p.wx),
        y: perParticle((p) => p.wy),
        size: layout.monoScale,
        ease: spring({ mass: 1, stiffness: 70, damping: 10 }),
        delay: perParticle((p) => (Math.abs(p.px - cx) / width) * 600 + utils.random(0, 120)),
      }),
    );
  };

  const backToPhrase = async () => {
    const cx = width / 2;
    const cy = height / 2;
    for (const p of particles) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const dist = utils.random(30, 120) + d * 0.25;
      p.tx = p.x + (dx / d) * dist;
      p.ty = p.y + (dy / d) * dist * 0.6;
    }
    shockwave(cx, cy, width * 0.7, 1.8);
    burst(cx, cy, 40, 8);
    state.sparkRate = 0.0016;
    await track(
      animate(particles, {
        x: perParticle((p) => p.tx),
        y: perParticle((p) => p.ty),
        size: 0.7,
        duration: 480,
        ease: "outExpo",
      }),
    );
    track(
      animate(particles, {
        gold: perParticle((p) => (p.letter >= 0 ? 1 : 0)),
        duration: 900,
        ease: "inOutQuad",
        delay: () => utils.random(0, 300),
      }),
    );
    await track(
      animate(particles, {
        x: perParticle((p) => p.px),
        y: perParticle((p) => p.py),
        size: 1,
        ease: bouncy,
        delay: () => utils.random(0, 350),
      }),
    );
  };

  const run = async () => {
    if (options.playIntro) {
      await wait(220);
      if (!alive) return;
      await formStaff();
      await wait(420);
      if (!alive) return;
      await decode();
      if (!alive) return;
      await ignite();
    } else {
      for (const p of particles) {
        p.x = p.tx;
        p.y = p.ty;
        p.size = 0.4;
        p.gold = 0;
      }
      await decode();
      track(
        animate(particles, {
          gold: perParticle((p) => (p.letter >= 0 ? 1 : 0)),
          duration: 600,
          ease: "outQuad",
        }),
      );
    }
    if (!alive) return;
    startGlint();
    while (alive) {
      await wait(4500);
      if (!alive) return;
      await toMono();
      await wait(2400);
      if (!alive) return;
      await backToPhrase();
    }
  };
  void run();

  return {
    setPalette(palette) {
      options.palette = palette;
      colors = buildColors(palette);
    },
    dispose() {
      alive = false;
      for (const tickable of running) tickable.cancel();
      running.clear();
      loop.cancel();
      visibility.disconnect();
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("pointercancel", onLeave);
      canvas.removeEventListener("pointerdown", onDown);
    },
  };
}
