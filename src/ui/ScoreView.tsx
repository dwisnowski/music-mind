import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay, PointF2D, type Cursor } from "opensheetmusicdisplay";
import type { FeedbackState } from "../practice/feedbackEngine";
import type { ScoreEvent } from "../score/types";

const PRACTICE_CURSOR = "#2f6fed";
const LISTEN_CURSOR = "#c98512";
const LISTEN_NOTE = "#b45309";
const WRITE_SELECTION = "#0f766e";

export type ListenTransport = "idle" | "playing" | "paused";

export interface WriteNoteClickInfo {
  absoluteOnset: number;
  midi: number | null;
  staffIndex: number | null;
  eventIndex: number | null;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

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
  /**
   * Write-mode note selection. When set, idle clicks select notes instead of
   * seeking practice. Shift/Ctrl/Cmd modifiers are reported to the handler.
   */
  writeSelection?: {
    selectedIds: string[];
    /** Resolve a click hit to a write-note id. */
    resolveNoteId: (info: WriteNoteClickInfo) => string | null;
    /** True when a graphical note belongs to the selection. */
    noteIsSelected: (info: {
      absoluteOnset: number;
      midi: number | null;
      staffIndex: number | null;
    }) => boolean;
    onSelect: (noteId: string, info: WriteNoteClickInfo) => void;
  };
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
  writeSelection,
}: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const practiceLast = useRef(-1);
  const listenLast = useRef(-1);
  const practiceHighlights = useRef<HighlightedEl[]>([]);
  const listenHighlights = useRef<HighlightedEl[]>([]);
  const selectionHighlights = useRef<HighlightedEl[]>([]);
  const eventsRef = useRef(events);
  const transportRef = useRef(listenTransport);
  const onSeekListenRef = useRef(onSeekListen);
  const onSeekPracticeRef = useRef(onSeekPractice);
  const writeSelectionRef = useRef(writeSelection);

  eventsRef.current = events;
  transportRef.current = listenTransport;
  onSeekListenRef.current = onSeekListen;
  onSeekPracticeRef.current = onSeekPractice;
  writeSelectionRef.current = writeSelection;

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
    clearHighlights(selectionHighlights);

    void (async () => {
      await osmd.load(xml);
      if (cancelled) return;
      osmd.render();
      const [practice, listen] = osmd.cursors ?? [];
      practice?.show();
      practice?.reset();
      listen?.hide();
      applyWriteSelectionHighlights(osmd, writeSelectionRef.current, selectionHighlights);
      onReady?.(osmd);
    })();

    const container = containerRef.current;
    const onClick = (ev: MouseEvent) => {
      const current = osmdRef.current;
      if (!current?.GraphicSheet || !container) return;

      const alt = ev.altKey;
      const shift = ev.shiftKey;
      const transport = transportRef.current;
      const write = writeSelectionRef.current;

      if (write && transport === "idle" && !alt) {
        const hit = hitFromClick(current, container, ev, eventsRef.current);
        if (!hit) return;
        const info: WriteNoteClickInfo = {
          ...hit,
          shiftKey: shift,
          metaKey: ev.metaKey,
          ctrlKey: ev.ctrlKey,
        };
        const noteId = write.resolveNoteId(info);
        if (!noteId) return;
        write.onSelect(noteId, info);
        return;
      }

      const index = eventIndexFromClick(current, container, ev, eventsRef.current);
      if (index == null) return;

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
      clearHighlights(selectionHighlights);
      osmdRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [xml, onReady]);

  // Re-color selection when ids change without reloading XML.
  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd?.GraphicSheet) return;
    applyWriteSelectionHighlights(osmd, writeSelection, selectionHighlights);
  }, [writeSelection?.selectedIds, writeSelection]);

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

  const title = writeSelection
    ? "Click a note to select. Shift+click range. Ctrl/Cmd+click toggle. Option+click seeks Listen."
    : "Click: seek practice (idle) or Listen (playing/paused). Shift+click practice. Option+click Listen.";

  return (
    <div
      className={`score-view ${listenEventIndex != null ? "is-listening" : ""}`}
      ref={containerRef}
      title={title}
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
    colorGraphicNote(note, color, store);
  }
}

function colorGraphicNote(
  note: unknown,
  color: string,
  store: { current: HighlightedEl[] },
) {
  const group = (
    note as { getSVGGElement?: () => SVGGElement | null }
  ).getSVGGElement?.();
  if (!group) return;
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

type NoteHit = {
  absoluteOnset: number;
  midi: number | null;
  staffIndex: number | null;
  eventIndex: number | null;
};

function hitFromClick(
  osmd: OpenSheetMusicDisplay,
  container: HTMLElement,
  ev: MouseEvent,
  events: ScoreEvent[],
): NoteHit | null {
  const rect = container.getBoundingClientRect();
  const zoom = osmd.zoom || 1;
  const click = new PointF2D(
    (ev.clientX - rect.left) / 10 / zoom,
    (ev.clientY - rect.top) / 10 / zoom,
  );

  const sheet = osmd.GraphicSheet;
  if (!sheet) return null;

  let absoluteOnset: number | null = null;
  let midi: number | null = null;
  let staffIndex: number | null = null;

  try {
    type LooseGNote = {
      sourceNote?: {
        halfTone?: number;
        Pitch?: { getHalfTone?: () => number };
        ParentStaff?: { idInMusicSheet?: number };
        ParentStaffEntry?: {
          Timestamp?: { RealValue?: number };
          AbsoluteTimestamp?: { RealValue?: number };
        };
      };
      parentVoiceEntry?: {
        parentStaffEntry?: {
          getAbsoluteTimestamp?: () => { RealValue?: number };
        };
      };
    };
    const nearestNote = (
      sheet as unknown as {
        GetNearestNote: (p: PointF2D, max?: PointF2D) => LooseGNote | null;
      }
    ).GetNearestNote(click, new PointF2D(2.5, 2.5));

    const source = nearestNote?.sourceNote;
    if (source) {
      const ht = source.halfTone ?? source.Pitch?.getHalfTone?.() ?? null;
      // OSMD halfTone is MIDI-like on current builds; keep the raw value.
      if (typeof ht === "number" && Number.isFinite(ht)) {
        midi = ht;
      }
      const staffId = source.ParentStaff?.idInMusicSheet;
      if (typeof staffId === "number") staffIndex = staffId;
    }

    const absFromEntry =
      nearestNote?.parentVoiceEntry?.parentStaffEntry?.getAbsoluteTimestamp?.()?.RealValue;
    const absFromSource =
      source?.ParentStaffEntry?.AbsoluteTimestamp?.RealValue ??
      source?.ParentStaffEntry?.Timestamp?.RealValue;
    const abs = absFromEntry ?? absFromSource;
    if (typeof abs === "number" && Number.isFinite(abs)) {
      absoluteOnset = abs * 4;
    }
  } catch {
    /* fall through to staff-entry hit */
  }

  if (absoluteOnset == null) {
    try {
      const staffEntry = sheet.GetNearestStaffEntry(click);
      const abs = staffEntry?.getAbsoluteTimestamp?.();
      if (abs && typeof abs.RealValue === "number") {
        absoluteOnset = abs.RealValue * 4;
      }
    } catch {
      return null;
    }
  }

  if (absoluteOnset == null || Number.isNaN(absoluteOnset)) return null;

  const eventIndex = events.length ? nearestEventIndex(events, absoluteOnset) : null;
  if (midi == null && eventIndex != null) {
    const evNotes = events[eventIndex]?.notes ?? [];
    const staffNotes =
      staffIndex != null ? evNotes.filter((n) => n.staffIndex === staffIndex) : evNotes;
    const pick = staffNotes[0] ?? evNotes[0];
    if (pick) {
      midi = pick.midi;
      staffIndex = staffIndex ?? pick.staffIndex;
    }
  }

  return { absoluteOnset, midi, staffIndex, eventIndex };
}

function applyWriteSelectionHighlights(
  osmd: OpenSheetMusicDisplay,
  writeSelection: ScoreViewProps["writeSelection"] | undefined,
  store: { current: HighlightedEl[] },
) {
  clearHighlights(store);
  if (!writeSelection?.selectedIds.length) return;

  const sheet = osmd.GraphicSheet as {
    MeasureList?: unknown[][];
  } | null;
  const measureList = sheet?.MeasureList;
  if (!measureList) return;

  for (const staffMeasures of measureList) {
    if (!staffMeasures) continue;
    for (const gMeasure of staffMeasures) {
      if (!gMeasure) continue;
      const staffEntries =
        (
          gMeasure as {
            staffEntries?: {
              graphicalVoiceEntries?: {
                notes?: unknown[];
              }[];
              getAbsoluteTimestamp?: () => { RealValue?: number };
            }[];
          }
        ).staffEntries ?? [];
      for (const entry of staffEntries) {
        const abs = entry.getAbsoluteTimestamp?.()?.RealValue;
        const absoluteOnset = typeof abs === "number" ? abs * 4 : null;
        for (const gve of entry.graphicalVoiceEntries ?? []) {
          for (const gNote of gve.notes ?? []) {
            const source = (
              gNote as {
                sourceNote?: {
                  halfTone?: number;
                  Pitch?: { getHalfTone?: () => number };
                  ParentStaff?: { idInMusicSheet?: number };
                };
              }
            ).sourceNote;
            const ht = source?.halfTone ?? source?.Pitch?.getHalfTone?.() ?? null;
            const midi =
              typeof ht === "number" && Number.isFinite(ht) ? ht : null;
            const staffIndex =
              typeof source?.ParentStaff?.idInMusicSheet === "number"
                ? source.ParentStaff.idInMusicSheet
                : null;
            if (absoluteOnset == null) continue;
            if (
              writeSelection.noteIsSelected({
                absoluteOnset,
                midi,
                staffIndex,
              })
            ) {
              colorGraphicNote(gNote, WRITE_SELECTION, store);
            }
          }
        }
      }
    }
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
  const hit = hitFromClick(osmd, container, ev, events);
  return hit?.eventIndex ?? null;
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
