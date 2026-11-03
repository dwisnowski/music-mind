export type Hand = "right" | "left" | "both";

export interface ScoreNote {
  midi: number;
  /** 0 = typically treble/RH, 1 = bass/LH for grand staff */
  staffIndex: number;
  measureIndex: number;
  /** Absolute timestamp in quarter-note units from OSMD */
  timestamp: number;
  duration: number;
  /** OSMD Note object reference for SVG highlighting */
  osmdNote: unknown;
}

export interface ScoreEvent {
  index: number;
  timestamp: number;
  notes: ScoreNote[];
}

export interface LoadedScore {
  title: string;
  events: ScoreEvent[];
  xml: string;
}

export function filterEventByHand(event: ScoreEvent, hand: Hand): ScoreEvent {
  if (hand === "both") return event;
  const notes = event.notes.filter((n) =>
    hand === "right" ? n.staffIndex === 0 : n.staffIndex >= 1,
  );
  return { ...event, notes };
}

export function pitchClassSet(notes: ScoreNote[]): Set<number> {
  return new Set(notes.map((n) => n.midi));
}
