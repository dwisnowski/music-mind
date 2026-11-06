import type { SongSection, WriteComplexity } from "../write/document";

interface SongFormHelperProps {
  sections: SongSection[];
  currentMeasure: number;
  writeMode: WriteComplexity;
  onJump: (measureIndex: number) => void;
  onToggleChecklist: (
    sectionId: string,
    key: keyof SongSection["checklist"],
  ) => void;
  onEditForm: () => void;
}

export function SongFormHelper({
  sections,
  currentMeasure,
  writeMode,
  onJump,
  onToggleChecklist,
  onEditForm,
}: SongFormHelperProps) {
  // Empty state lives on Song template in the toolbar — never show a blank side card.
  if (!sections.length) return null;

  const active =
    sections.find(
      (s) =>
        currentMeasure >= s.startMeasure &&
        currentMeasure < s.startMeasure + s.barCount,
    ) ?? sections[0]!;

  return (
    <aside className="song-form-helper" aria-label="Song form helper">
      <header className="song-form-helper-header">
        <h3>Song form</h3>
        <button type="button" className="btn ghost" onClick={onEditForm}>
          Edit form
        </button>
      </header>
      <ol className="song-form-roadmap">
        {sections.map((s) => {
          const isActive =
            currentMeasure >= s.startMeasure &&
            currentMeasure < s.startMeasure + s.barCount;
          return (
            <li key={s.id}>
              <button
                type="button"
                className={`song-form-road-item${isActive ? " active" : ""}`}
                onClick={() => onJump(s.startMeasure)}
              >
                <span className="label">{s.label}</span>
                <span className="bars">{s.barCount} bars</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="song-form-focus">
        <h4>{active.label}</h4>
        <p>{active.prompt || "Sketch what this section needs."}</p>
        <ul className="song-form-checklist">
          <li>
            <label>
              <input
                type="checkbox"
                checked={active.checklist.melody}
                onChange={() => onToggleChecklist(active.id, "melody")}
              />
              Melody sketched
            </label>
          </li>
          <li>
            <label>
              <input
                type="checkbox"
                checked={active.checklist.harmony}
                onChange={() => onToggleChecklist(active.id, "harmony")}
              />
              Harmony / bass
            </label>
          </li>
          {writeMode === "lyrics" || writeMode === "advanced" ? (
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={active.checklist.lyrics}
                  onChange={() => onToggleChecklist(active.id, "lyrics")}
                />
                Lyrics
              </label>
            </li>
          ) : null}
          {writeMode === "advanced" ? (
            <li>
              <label>
                <input
                  type="checkbox"
                  checked={active.checklist.dynamics}
                  onChange={() => onToggleChecklist(active.id, "dynamics")}
                />
                Dynamics / expression
              </label>
            </li>
          ) : null}
        </ul>
      </div>
    </aside>
  );
}
