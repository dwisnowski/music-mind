import { useMemo, useState } from "react";
import {
  SONG_FORM_PRESETS,
  cloneFormDefs,
  type SongFormPreset,
  type SongFormSectionDef,
} from "../write/songForms";

interface SongFormPickerProps {
  open: boolean;
  onClose: () => void;
  onApply: (preset: SongFormPreset, sections: SongFormSectionDef[]) => void;
}

export function SongFormPicker({ open, onClose, onApply }: SongFormPickerProps) {
  const [presetId, setPresetId] = useState(SONG_FORM_PRESETS[1]?.id ?? "pop-interlude");
  const preset = useMemo(
    () => SONG_FORM_PRESETS.find((p) => p.id === presetId) ?? SONG_FORM_PRESETS[0]!,
    [presetId],
  );
  const [sections, setSections] = useState<SongFormSectionDef[]>(() =>
    cloneFormDefs(preset),
  );

  if (!open) return null;

  const selectPreset = (id: string) => {
    setPresetId(id);
    const p = SONG_FORM_PRESETS.find((x) => x.id === id) ?? SONG_FORM_PRESETS[0]!;
    setSections(cloneFormDefs(p));
  };

  const updateSection = (index: number, patch: Partial<SongFormSectionDef>) => {
    setSections((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      {
        id: `sec-${Date.now()}`,
        label: `Section ${prev.length + 1}`,
        bars: 8,
        prompt: "Describe what this section needs.",
      },
    ]);
  };

  const removeSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    setSections((prev) => {
      const next = [...prev];
      const j = index + dir;
      if (j < 0 || j >= next.length) return prev;
      const tmp = next[index]!;
      next[index] = next[j]!;
      next[j] = tmp;
      return next;
    });
  };

  return (
    <div className="write-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="write-modal"
        role="dialog"
        aria-labelledby="song-form-picker-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="write-modal-header">
          <h2 id="song-form-picker-title">Song form template</h2>
          <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <p className="write-modal-lead">
          Pick a typical song pattern. We create labeled empty measures and a helper roadmap so
          you can think through each section while you write.
        </p>
        <label className="field">
          <span>Preset</span>
          <select value={presetId} onChange={(e) => selectPreset(e.target.value)}>
            {SONG_FORM_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">{preset.description}</p>
        <div className="song-form-editor">
          {sections.map((s, i) => (
            <div key={s.id} className="song-form-row">
              <input
                aria-label="Section label"
                value={s.label}
                onChange={(e) => updateSection(i, { label: e.target.value })}
              />
              <label className="field inline">
                <span>Bars</span>
                <input
                  type="number"
                  min={1}
                  max={64}
                  value={s.bars}
                  onChange={(e) =>
                    updateSection(i, { bars: Math.max(1, Number(e.target.value) || 1) })
                  }
                />
              </label>
              <input
                className="song-form-prompt"
                aria-label="Writer prompt"
                value={s.prompt}
                onChange={(e) => updateSection(i, { prompt: e.target.value })}
              />
              <div className="song-form-row-actions">
                <button type="button" className="btn ghost" onClick={() => move(i, -1)} title="Move up">
                  ↑
                </button>
                <button type="button" className="btn ghost" onClick={() => move(i, 1)} title="Move down">
                  ↓
                </button>
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => removeSection(i)}
                  disabled={sections.length <= 1}
                  title="Remove"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="panel-row wrap">
          <button type="button" className="btn" onClick={addSection}>
            Add section
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => onApply(preset, sections)}
            disabled={!sections.length}
          >
            Apply form
          </button>
        </div>
      </div>
    </div>
  );
}
