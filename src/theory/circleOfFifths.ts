import { normalizePc, pcName, type PitchClass } from "./pitch";

/** Circle of fifths order starting at C (0): C G D A E B F# C# … */
export const CIRCLE_FIFTHS: readonly PitchClass[] = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];

export interface CircleNeighbor {
  pc: PitchClass;
  name: string;
  /** Steps along the circle from the focus key (−1 = subdominant side, +1 = dominant). */
  steps: number;
  tip: string;
}

export interface CircleView {
  focusPc: PitchClass;
  focusName: string;
  relativeMinorPc: PitchClass;
  relativeMinorName: string;
  relativeMajorPc: PitchClass;
  relativeMajorName: string;
  neighbors: CircleNeighbor[];
  mixTip: string;
}

function tipForSteps(steps: number): string {
  if (steps === 0) return "Your home key.";
  if (steps === 1) return "Dominant side — V of your key; bright lift.";
  if (steps === -1) return "Subdominant side — IV of your key; warmer open.";
  if (Math.abs(steps) === 2) return "Near neighbor — easy modulation / borrowed color.";
  return "Farther around the circle — stronger key contrast.";
}

export function circleView(focusPc: PitchClass): CircleView {
  const focus = normalizePc(focusPc);
  const idx = CIRCLE_FIFTHS.indexOf(focus);
  const at = idx >= 0 ? idx : 0;

  const neighbors: CircleNeighbor[] = [];
  for (const steps of [-2, -1, 0, 1, 2]) {
    const pc = CIRCLE_FIFTHS[(at + steps + 12) % 12]!;
    neighbors.push({
      pc,
      name: pcName(pc),
      steps,
      tip: tipForSteps(steps),
    });
  }

  const relativeMinorPc = normalizePc(focus + 9); // major → relative minor
  const relativeMajorPc = normalizePc(focus + 3); // minor → relative major

  return {
    focusPc: focus,
    focusName: pcName(focus),
    relativeMinorPc,
    relativeMinorName: pcName(relativeMinorPc),
    relativeMajorPc,
    relativeMajorName: pcName(relativeMajorPc),
    neighbors,
    mixTip: `${pcName(focus)} major pairs with ${pcName(relativeMinorPc)} minor (relative). Nearby keys (±1–2 fifths) share most tones — mix those scales freely; jump farther for contrast.`,
  };
}
