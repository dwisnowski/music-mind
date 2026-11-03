import { useEffect, useRef } from "react";
import { OpenSheetMusicDisplay } from "opensheetmusicdisplay";
import type { FeedbackState } from "../practice/feedbackEngine";

interface ScoreViewProps {
  xml: string | null;
  feedback: FeedbackState | null;
  onReady?: (osmd: OpenSheetMusicDisplay) => void;
}

export function ScoreView({ xml, feedback, onReady }: ScoreViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const osmdRef = useRef<OpenSheetMusicDisplay | null>(null);
  const lastIndex = useRef(-1);

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
    // Blue vertical practice cursor (Simply Piano Feedback-style)
    osmd.setOptions({
      cursorsOptions: [{ type: 0, color: "#2f6fed", alpha: 0.28, follow: true }] as never,
    });
    osmdRef.current = osmd;

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
      osmdRef.current = null;
      if (container) container.innerHTML = "";
    };
  }, [xml, onReady]);

  useEffect(() => {
    const osmd = osmdRef.current;
    if (!osmd?.cursor || !feedback) return;

    if (feedback.done) {
      osmd.cursor.hide();
      return;
    }

    osmd.cursor.show();
    // Advance OSMD cursor to match event index (reset + next N times).
    // For large scores this is imperfect but works for MVP wait-for-me.
    if (feedback.eventIndex !== lastIndex.current) {
      osmd.cursor.reset();
      for (let i = 0; i < feedback.eventIndex; i++) {
        osmd.cursor.next();
      }
      lastIndex.current = feedback.eventIndex;
      try {
        osmd.cursor.update();
      } catch {
        /* older OSMD */
      }
      scrollCursorIntoView(containerRef.current);
    }
  }, [feedback]);

  return <div className="score-view" ref={containerRef} />;
}

function scrollCursorIntoView(root: HTMLElement | null) {
  if (!root) return;
  const cursor = root.querySelector(".cursor") ?? root.querySelector("[class*='cursor']");
  if (cursor instanceof HTMLElement) {
    cursor.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}
