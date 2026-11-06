import { useEffect, useMemo, useRef } from "react";
import {
  createMusicMindScene,
  type MusicMindPalette,
  type MusicMindScene,
} from "../home/musicMindScene";

function readPalette(): MusicMindPalette {
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    ink: read("--ink", "#1c1410"),
    accent: read("--accent", "#2f6fed"),
    wood: read("--wood", "#8b5a2b"),
    hint: read("--hint", "#c98512"),
  };
}

export function MusicMindParticles() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<MusicMindScene | null>(null);
  const palette = useMemo(() => readPalette(), []);

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let disposed = false;
    let introPlayed = false;
    let lastWidth = 0;
    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;

    const build = (width: number) => {
      sceneRef.current?.dispose();
      sceneRef.current = createMusicMindScene(canvas, {
        width,
        palette,
        playIntro: !introPlayed && !reducedMotion,
        reducedMotion,
      });
      introPlayed = true;
    };

    const observer = new ResizeObserver(([entry]) => {
      const width = Math.round(entry.contentRect.width);
      if (!width || width === lastWidth) return;
      const first = lastWidth === 0;
      lastWidth = width;
      clearTimeout(resizeTimeout);
      if (first) build(width);
      else resizeTimeout = setTimeout(() => build(width), 200);
    });

    document.fonts.load('600 100px "Fraunces"').finally(() => {
      if (!disposed) observer.observe(container);
    });

    return () => {
      disposed = true;
      clearTimeout(resizeTimeout);
      observer.disconnect();
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [palette]);

  return (
    <div ref={containerRef} className="mm-particles">
      <canvas
        ref={canvasRef}
        width={0}
        height={0}
        aria-hidden="true"
        className="mm-particles-canvas"
      />
    </div>
  );
}
