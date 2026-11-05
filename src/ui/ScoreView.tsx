import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay, PointF2D, type Cursor } from "opensheetmusicdisplay";
import type { FeedbackState } from "../practice/feedbackEngine";
import type { ScoreEvent } from "../score/types";

const PRACTICE_CURSOR = "#2f6fed";
const LISTEN_CURSOR = "#c98512";
const LISTEN_NOTE = "#b45309";

export type ListenTransport = "idle" | "playing" | "paused";

interface ScoreViewProps {
  xml: string | null;
  events: ScoreEvent[];
  feedback: FeedbackState | null;
  /** Non-null while Listen is playing or paused. */
  listenEventIndex: number | null;
  listenTransport: ListenTransport;
  onSeekListen?: (eventIndex: number) => void;
  onSeekPractice?: (eventIndex: number) => void;
  onReady?: (osmd: OpenSheetMusicDisplay) => void;
}

type HighlightedEl = {
  el: SVGElement;
  fill: string;
  stroke: string;
};

export function ScoreView({
  xml,
  events,
  feedback,
  listenEventIndex,
  listenTransport,
  onSeekListen,
  onSeekPractice,
  onReady,
}: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const practiceLast = useRef(-1);
  const listenLast = useRef(-1);
  const practiceHighlights = useRef<HighlightedEl[]>([]);
  const listenHighlights = useRef<HighlightedEl[]>([]);
  const eventsRef = useRef(events);
  const transportRef = useRef(listenTransport);
  const onSeekListenRef = useRef(onSeekListen);
  const onSeekPracticeRef = useRef(onSeekPractice);

  eventsRef.current = events;
  transportRef.current = listenTransport;
  onSeekListenRef.current = onSeekListen;
  onSeekPracticeRef.current = onSeekPractice;

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
      cursorsOptions: [
        { type: 0, color: PRACTICE_CURSOR, alpha: 0.28, follow: false },
        { type: 0, color: LISTEN_CURSOR, alpha: 0.34, follow: true },
      ] as never,
    });
    osmdRef.current = osmd;
    practiceLast.current = -1;
    listenLast.current = -1;
    clearHighlights(practiceHighlights);
    clearHighlights(listenHighlights);

    void (async () => {
      await osmd.load(xml);
      if (cancelled) return;
      osmd.render();
      const [practice, listen] = osmd.cursors ?? [];
      practice?.show();
      practice?.reset();
      listen?.hide();
      onReady?.(osmd);
    })();

    const container = containerRef.current;
    const onClick = (ev: MouseEvent) => {
      const current = osmdRef.current;
      if (!current?.GraphicSheet || !container) return;
      const index = eventIndexFromClick(current, container, ev, eventsRef.current);
      if (index == null) return;

      const alt = ev.altKey;
      const shift = ev.shiftKey;
      const transport = transportRef.current;

      if (shift) {
        onSeekPracticeRef.current?.(index);
        return;
      }
      if (alt) {
        onSeekListenRef.current?.(index);
        return;
      }
      if (transport === "idle") {
        onSeekPracticeRef.current?.(index);
      } else {
        onSeekListenRef.current?.(index);
      }
    };
    container.addEventListener("click", onClick);

    return () => {
      cancelled = true;
      container.removeEventListener("click", onClick);
      clearHighlights(practiceHighlights);
      clearHighlights(listenHighlights);
      osmdRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [xml, onReady]);

  // Practice cursor (always tracks Feedback when possible)
  useEffect(() => {
    const osmd = osmdRef.current;
    const practice = osmd?.cursors?.[0];
    if (!osmd || !practice || !feedback) return;

    if (feedback.done) {
      practice.hide();
      clearHighlights(practiceHighlights);
      practiceLast.current = -1;
      return;
    }

    practice.show();
    if (feedback.eventIndex !== practiceLast.current) {
      moveCursorTo(practice, feedback.eventIndex, practiceLast);
      clearHighlights(practiceHighlights);
      highlightCursorNotes(practice, PRACTICE_CURSOR, practiceHighlights);
    }
  }, [feedback]);

  // Listen cursor
  useEffect(() => {
    const osmd = osmdRef.current;
    const listen = osmd?.cursors?.[1];
    if (!osmd || !listen) return;

    if (listenEventIndex == null) {
      listen.hide();
      clearHighlights(listenHighlights);
      listenLast.current = -1;
      return;
    }

    listen.show();
    moveCursorTo(listen, listenEventIndex, listenLast);
    clearHighlights(listenHighlights);
    highlightCursorNotes(listen, LISTEN_NOTE, listenHighlights);
    if (listenTransport === "playing") {
      scrollCursorIntoView(listen);
    }
  }, [listenEventIndex, listenTransport]);

  return (
    <div
      className={`score-view ${listenEventIndex != null ? "is-listening" : ""}`}
      ref={containerRef}
      title="Click: seek practice (idle) or Listen (playing/paused). Shift+click practice. Option+click Listen."
    />
  );
}

function moveCursorTo(cursor: Cursor, eventIndex: number, lastIndex: { current: number }) {
  cursor.reset();
  for (let i = 0; i < eventIndex; i++) {
    cursor.next();
  }
  lastIndex.current = eventIndex;
  try {
    cursor.update();
  } catch {
    /* older OSMD */
  }
}

function highlightCursorNotes(
  cursor: Cursor,
  color: string,
  store: { current: HighlightedEl[] },
) {
  const notes = cursor.GNotesUnderCursor?.() ?? [];

  for (const note of notes) {
    const group = (
      note as { getSVGGElement?: () => SVGGElement | null }
    ).getSVGGElement?.();
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

function scrollCursorIntoView(cursor: Cursor) {
  const el = cursor.cursorElement;
  if (el instanceof HTMLElement) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
  }
}

/** Map a DOM click to the nearest ScoreEvent index via OSMD hit-testing. */
function eventIndexFromClick(
  osmd: OpenSheetMusicDisplay,
  container: HTMLElement,
  ev: MouseEvent,
  events: ScoreEvent[],
): number | null {
  if (events.length === 0) return null;
  const rect = container.getBoundingClientRect();
  const zoom = osmd.zoom || 1;
  const click = new PointF2D(
    (ev.clientX - rect.left) / 10 / zoom,
    (ev.clientY - rect.top) / 10 / zoom,
  );

  const sheet = osmd.GraphicSheet;
  if (!sheet) return null;

  let quarters: number | null = null;
  try {
    const staffEntry = sheet.GetNearestStaffEntry(click);
    const abs = staffEntry?.getAbsoluteTimestamp?.();
    if (abs && typeof abs.RealValue === "number") {
      // OSMD AbsoluteTimestamp RealValue is in whole notes; our timeline uses quarters.
      quarters = abs.RealValue * 4;
    }
  } catch {
    return null;
  }
  if (quarters == null || Number.isNaN(quarters)) return null;

  return nearestEventIndex(events, quarters);
}

/** Prefer first event at or after `quarters`; else nearest by distance. */
export function nearestEventIndex(events: ScoreEvent[], quarters: number): number {
  let atOrAfter: ScoreEvent | null = null;
  let nearest = events[0];
  let nearestDist = Math.abs(events[0].timestamp - quarters);

  for (const event of events) {
    const dist = Math.abs(event.timestamp - quarters);
    if (dist < nearestDist) {
      nearest = event;
      nearestDist = dist;
    }
    if (event.timestamp + 1e-6 >= quarters && atOrAfter == null) {
      atOrAfter = event;
    }
  }
  return (atOrAfter ?? nearest).index;
}
