import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { FeedbackState } from "../practice/feedbackEngine";

const PRACTICE_CURSOR = "#2f6fed";
const LISTEN_CURSOR = "#c98512";
const LISTEN_NOTE = "#b45309";

interface ScoreViewProps {
  xml: string | null;
  feedback: FeedbackState | null;
  /** When non-null, Listen mode owns the cursor/highlights. */
  listenEventIndex: number | null;
  onReady?: (osmd: OpenSheetMusicDisplay) => void;
}

type HighlightedEl = {
  el: SVGElement;
  fill: string;
  stroke: string;
};

export function ScoreView({ xml, feedback, listenEventIndex, onReady }: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const lastIndex = useRef(-1);
  const modeRef = useRef<"practice" | "listen">("practice");
  const highlightedRef = useRef<HighlightedEl[]>([]);

  useEffect(() => {
    if (!containerRef.current || !xml) return;
    let cancelled = false;

    const osmd = new OpenSheetMusicDisplay(containerRef.current, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
      drawSubtitle: false,
      drawComposer: true,
      drawLyricist: false,
      drawPartNames: false,
    });
    osmd.setOptions({
      cursorsOptions: [{ type: 0, color: PRACTICE_CURSOR, alpha: 0.28, follow: true }] as never,
    });
    osmdRef.current = osmd;
    lastIndex.current = -1;
    modeRef.current = "practice";
    clearHighlights(highlightedRef);

    void (async () => {
      await osmd.load(xml);
      if (cancelled) return;
      osmd.render();
      osmd.cursor?.show();
      osmd.cursor?.reset();
      onReady?.(osmd);
    })();

    const container = containerRef.current;
    return () => {
      cancelled = true;
      clearHighlights(highlightedRef);
      osmdRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [xml, onReady]);

  // Listen follow-along
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor) return;

    if (listenEventIndex == null) {
      if (modeRef.current === "listen") {
        clearHighlights(highlightedRef);
        setCursorColor(osmd, PRACTICE_CURSOR);
        modeRef.current = "practice";
        lastIndex.current = -1; // force practice effect to re-apply
      }
      return;
    }

    if (modeRef.current !== "listen") {
      setCursorColor(osmd, LISTEN_CURSOR);
      modeRef.current = "listen";
      lastIndex.current = -1;
    }

    osmd.cursor.show();
    moveCursorTo(osmd, listenEventIndex, lastIndex);
    clearHighlights(highlightedRef);
    highlightCursorNotes(osmd, LISTEN_NOTE, highlightedRef);
    scrollCursorIntoView(containerRef.current);
  }, [listenEventIndex]);

  // Practice follow-along (paused while listening)
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor || !feedback) return;
    if (listenEventIndex != null) return;

    if (feedback.done) {
      osmd.cursor.hide();
      clearHighlights(highlightedRef);
      return;
    }

    osmd.cursor.show();
    if (feedback.eventIndex !== lastIndex.current) {
      moveCursorTo(osmd, feedback.eventIndex, lastIndex);
      clearHighlights(highlightedRef);
      highlightCursorNotes(osmd, PRACTICE_CURSOR, highlightedRef);
      scrollCursorIntoView(containerRef.current);
    }
  }, [feedback, listenEventIndex]);

  return (
    <div
      className={`score-view ${listenEventIndex != null ? "is-listening" : ""}`}
      ref={containerRef}
    />
  );
}

function moveCursorTo(
  osmd: OpenSheetMusicDisplay,
  eventIndex: number,
  lastIndex: { current: number },
) {
  osmd.cursor.reset();
  for (let i = 0; i < eventIndex; i++) {
    osmd.cursor.next();
  }
  lastIndex.current = eventIndex;
  try {
    osmd.cursor.update();
  } catch {
    /* older OSMD */
  }
}

function setCursorColor(osmd: OpenSheetMusicDisplay, color: string) {
  try {
    osmd.setOptions({
      cursorsOptions: [{ type: 0, color, alpha: 0.32, follow: true }] as never,
    });
    osmd.cursor?.update();
  } catch {
    /* ignore */
  }
}

function highlightCursorNotes(
  osmd: OpenSheetMusicDisplay,
  color: string,
  store: { current: HighlightedEl[] },
) {
  const cursor = osmd.cursor as {
    GNotesUnderCursor?: () => Array<{ getSVGGElement?: () => SVGGElement | null }>;
    NotesUnderCursor?: () => Array<{ getSVGGElement?: () => SVGGElement | null }>;
  };
  const notes =
    cursor.GNotesUnderCursor?.() ??
    cursor.NotesUnderCursor?.() ??
    [];

  for (const note of notes) {
    const group = note.getSVGGElement?.();
    if (!group) continue;
    group.querySelectorAll("path, ellipse, rect, use").forEach((node) => {
      const el = node as SVGElement;
      store.current.push({
        el,
        fill: el.style.fill || "",
        stroke: el.style.stroke || "",
      });
      el.style.fill = color;
      el.style.stroke = color;
    });
  }
}

function clearHighlights(store: { current: HighlightedEl[] }) {
  for (const item of store.current) {
    item.el.style.fill = item.fill;
    item.el.style.stroke = item.stroke;
  }
  store.current = [];
}

function scrollCursorIntoView(root: HTMLElement | null) {
  if (!root) return;
  const cursor = root.querySelector(".cursor") ?? root.querySelector("[class*='cursor']");
  if (cursor instanceof HTMLElement) {
    cursor.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}
