import { useMemo } from "react";
import {
  GENRES,
  SCALES,
  PC_NAMES,
  classifyHeld,
  circleView,
  diatonicChords,
  getGenre,
  getRiff,
  riffsForGenre,
  type GenreId,
  type ScaleId,
  type DiatonicChord,
} from "../theory";
import type { FreePracticePlayMode, TheoryTab } from "./types";
import type { FreePracticeSnapshot } from "./FreePracticeEngine";
import type { UserRiff } from "../theory/userRiffStore";

export interface FreePracticeWorkspaceProps {
  genreId: GenreId;
  rootPc: number;
  scaleId: ScaleId;
  playMode: FreePracticePlayMode;
  chordKey: string | null;
  riffId: string | null;
  userRiffs: UserRiff[];
  theoryTab: TheoryTab;
  heldMidis: ReadonlySet<number>;
  guided: FreePracticeSnapshot;
  onGenre: (id: GenreId) => void;
  onRoot: (pc: number) => void;
  onScale: (id: ScaleId) => void;
  onPlayMode: (mode: FreePracticePlayMode) => void;
  onChordKey: (key: string | null) => void;
  onRiffId: (id: string | null) => void;
  onTheoryTab: (tab: TheoryTab) => void;
  onDemo: () => void;
  onRestartGuided: () => void;
  onExit: () => void;
}

export function chordKeyOf(c: DiatonicChord): string {
  return `${c.degree}:${c.roman}:${c.quality}`;
}

export function FreePracticeWorkspace({
  genreId,
  rootPc,
  scaleId,
  playMode,
  chordKey,
  riffId,
  userRiffs,
  theoryTab,
  heldMidis,
  guided,
  onGenre,
  onRoot,
  onScale,
  onPlayMode,
  onChordKey,
  onRiffId,
  onTheoryTab,
  onDemo,
  onRestartGuided,
  onExit,
}: FreePracticeWorkspaceProps) {
  const genre = getGenre(genreId);
  const chords = useMemo(() => diatonicChords(rootPc, scaleId), [rootPc, scaleId]);
  const selectedChord = useMemo(
    () => chords.find((c) => chordKeyOf(c) === chordKey) ?? null,
    [chords, chordKey],
  );
  const riffs = useMemo(() => riffsForGenre(genreId), [genreId]);
  const catalogRiff = riffId ? getRiff(riffId) : undefined;
  const userRiff = riffId ? userRiffs.find((r) => r.id === riffId) : undefined;
  const activeRiff = catalogRiff
    ? { name: catalogRiff.name, description: catalogRiff.description }
    : userRiff
      ? {
          name: userRiff.name,
          description: `Saved riff · ${userRiff.midis.length} notes (absolute pitches).`,
        }
      : undefined;
  const intervals = useMemo(() => classifyHeld(heldMidis), [heldMidis]);
  const circle = useMemo(() => circleView(rootPc), [rootPc]);

  const scaleOptions = useMemo(() => {
    const preferred = new Set(genre.scales);
    const head = SCALES.filter((s) => preferred.has(s.id));
    const rest = SCALES.filter((s) => !preferred.has(s.id));
    return [...head, ...rest];
  }, [genre]);

  const guidedStatus =
    playMode !== "guided"
      ? null
      : guided.phase === "complete"
        ? "Riff complete — Restart to play again, or pick another riff."
        : guided.phase === "demo"
          ? `Demo… note ${guided.demoIndex + 1} of ${guided.phrase.length}`
          : guided.phase === "playing" || guided.phase === "ready"
            ? `Play note ${guided.cursor + 1} of ${guided.phrase.length}`
            : "Pick a riff to start guided practice.";

  return (
    <div className="free-practice">
      <div className="free-practice-toolbar">
        <div className="free-practice-title-block">
          <h2>Free Practice</h2>
          <p className="free-practice-lede">
            Light scales and riffs as melodic helpers — then use theory tabs to see what fits
            together.
          </p>
        </div>
        <button type="button" className="btn" onClick={onExit}>
          Leave
        </button>
      </div>

      <div className="free-practice-controls">
        <label className="field">
          <span>Genre</span>
          <select
            value={genreId}
            onChange={(e) => onGenre(e.target.value as GenreId)}
            aria-label="Genre"
          >
            {GENRES.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Root</span>
          <select
            value={rootPc}
            onChange={(e) => onRoot(Number(e.target.value))}
            aria-label="Root pitch"
          >
            {PC_NAMES.map((name, pc) => (
              <option key={name} value={pc}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Scale</span>
          <select
            value={scaleId}
            onChange={(e) => onScale(e.target.value as ScaleId)}
            aria-label="Scale"
          >
            {scaleOptions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <div className="free-practice-mode" role="group" aria-label="Practice mode">
          <button
            type="button"
            className={`btn${playMode === "free" ? " primary" : ""}`}
            aria-pressed={playMode === "free"}
            onClick={() => onPlayMode("free")}
          >
            Free
          </button>
          <button
            type="button"
            className={`btn${playMode === "guided" ? " primary" : ""}`}
            aria-pressed={playMode === "guided"}
            onClick={() => onPlayMode("guided")}
          >
            Guided
          </button>
        </div>
      </div>

      <p className="free-practice-blurb">{genre.blurb}</p>

      {playMode === "guided" ? (
        <div className="free-practice-riffs">
          <div className="free-practice-riff-list" role="list">
            {riffs.map((r) => (
              <button
                key={r.id}
                type="button"
                role="listitem"
                className={`btn${riffId === r.id ? " primary" : ""}`}
                onClick={() => onRiffId(r.id)}
                title={r.description}
              >
                {r.name}
              </button>
            ))}
          </div>
          {userRiffs.length ? (
            <div className="free-practice-saved-riffs">
              <span className="muted">Saved</span>
              <div className="free-practice-riff-list" role="list">
                {userRiffs.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    role="listitem"
                    className={`btn${riffId === r.id ? " primary" : ""}`}
                    onClick={() => onRiffId(r.id)}
                    title={`${r.midis.length} notes`}
                  >
                    {r.name}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className="free-practice-riff-actions">
            <button
              type="button"
              className="btn"
              disabled={!activeRiff || guided.phase === "demo"}
              onClick={onDemo}
            >
              Demo
            </button>
            <button
              type="button"
              className="btn"
              disabled={!activeRiff}
              onClick={onRestartGuided}
            >
              Restart
            </button>
            {guidedStatus ? <span className="free-practice-status">{guidedStatus}</span> : null}
          </div>
          {activeRiff ? (
            <p className="free-practice-riff-desc">{activeRiff.description}</p>
          ) : null}
        </div>
      ) : (
        <p className="free-practice-status">
          Soft lights = scale tones
          {selectedChord ? `; stronger lights = ${selectedChord.roman} chord tones` : ""}. Improvise
          freely on the lit keys.
        </p>
      )}

      <div className="free-practice-theory">
        <div className="free-practice-tabs" role="tablist" aria-label="Theory helpers">
          {(
            [
              ["chords", "Chords"],
              ["intervals", "Intervals"],
              ["circle", "Circle"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={theoryTab === id}
              className={`btn${theoryTab === id ? " primary" : ""}`}
              onClick={() => onTheoryTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="free-practice-tab-panel" role="tabpanel">
          {theoryTab === "chords" ? (
            <>
              <p className="free-practice-tip">
                Pick a diatonic chord to light its tones brighter inside the scale. These are the
                notes that sound most at home together in this key.
              </p>
              <div className="free-practice-chord-grid">
                <button
                  type="button"
                  className={`btn${chordKey == null ? " primary" : ""}`}
                  onClick={() => onChordKey(null)}
                >
                  Scale only
                </button>
                {chords.map((c) => {
                  const key = chordKeyOf(c);
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`btn${chordKey === key ? " primary" : ""}`}
                      onClick={() => onChordKey(key)}
                      title={c.blurb}
                    >
                      {c.roman}
                    </button>
                  );
                })}
              </div>
              {selectedChord ? (
                <p className="free-practice-chord-blurb">
                  <strong>{selectedChord.name}</strong> — {selectedChord.blurb}
                </p>
              ) : null}
            </>
          ) : null}

          {theoryTab === "intervals" ? (
            <>
              <p className="free-practice-tip">
                Hold two or more notes. We name the intervals and whether they blend, tense, or
                clash.
              </p>
              {intervals ? (
                <div className="free-practice-intervals">
                  <p className="free-practice-summary">{intervals.summary}</p>
                  <ul>
                    {intervals.fromBass.map((iv, i) => (
                      <li key={`${iv.short}-${i}`}>
                        <span className={`cons-${iv.consonance}`}>{iv.short}</span> {iv.name} —{" "}
                        {iv.tip}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="free-practice-status">Play and hold at least two notes.</p>
              )}
            </>
          ) : null}

          {theoryTab === "circle" ? (
            <>
              <p className="free-practice-tip">{circle.mixTip}</p>
              <div className="free-practice-circle">
                {circle.neighbors.map((n) => (
                  <button
                    key={`${n.pc}-${n.steps}`}
                    type="button"
                    className={`btn circle-node${n.steps === 0 ? " primary" : ""}`}
                    onClick={() => onRoot(n.pc)}
                    title={n.tip}
                  >
                    <span className="circle-name">{n.name}</span>
                    <span className="circle-steps">
                      {n.steps === 0 ? "home" : n.steps > 0 ? `+${n.steps}` : `${n.steps}`}
                    </span>
                  </button>
                ))}
              </div>
              <p className="free-practice-status">
                Relative minor of {circle.focusName}: {circle.relativeMinorName}. Relative major of
                a {circle.focusName} minor center: {circle.relativeMajorName}.
              </p>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
