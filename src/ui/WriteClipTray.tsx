import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MidiAdapter } from "../midi/types";
import type { GenreId } from "../theory/genres";
import { GENRES } from "../theory/genres";
import {
  newUserRiffId,
  saveUserRiff,
} from "../theory/userRiffStore";
import {
  ClipPlayer,
  clipDurationSec,
  clipToMidiSequence,
  createClip,
  deleteClip,
  listClips,
  saveClip,
  trimmedClipEvents,
  type WriteClip,
} from "../write";
import {
  collapseChords,
  quantizeCapture,
  quantizePedals,
  velocityToDynamics,
} from "../write/quantize";

export interface WriteClipTrayProps {
  bpm: number;
  gridQuarters: number;
  adapter: MidiAdapter | null;
  /** Keep-recent windows available from parent buffer. */
  onKeepRecent: (sec: number) => WriteClip | null;
  takeActive: boolean;
  onStartTake: () => void;
  onStopTake: () => WriteClip | null;
  alsoSaveRecordToTray: boolean;
  onAlsoSaveRecordToTray: (v: boolean) => void;
  onInsert: (clip: WriteClip) => void;
  onStatus: (msg: string) => void;
  /** Bump to force a tray reload (e.g. after Record→tray save). */
  reloadToken?: number;
}

export function WriteClipTray({
  bpm,
  gridQuarters: _gridQuarters,
  adapter,
  onKeepRecent,
  takeActive,
  onStartTake,
  onStopTake,
  alsoSaveRecordToTray,
  onAlsoSaveRecordToTray,
  onInsert,
  onStatus,
  reloadToken = 0,
}: WriteClipTrayProps) {
  void _gridQuarters;
  const [clips, setClips] = useState<WriteClip[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [auditioning, setAuditioning] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);
  const [fpName, setFpName] = useState("");
  const [fpGenre, setFpGenre] = useState<GenreId>("pop");
  const playerRef = useRef(new ClipPlayer());

  const selected = useMemo(
    () => clips.find((c) => c.id === selectedId) ?? null,
    [clips, selectedId],
  );

  const reload = useCallback(async () => {
    try {
      const rows = await listClips();
      setClips(rows);
      setSelectedId((id) => (id && rows.some((r) => r.id === id) ? id : rows[0]?.id ?? null));
    } catch {
      setClips([]);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload, reloadToken]);

  useEffect(() => {
    const player = playerRef.current;
    return () => player.stop();
  }, []);

  const persist = async (clip: WriteClip) => {
    await saveClip(clip);
    await reload();
    setSelectedId(clip.id);
  };

  const keepRecent = async (sec: number) => {
    const clip = onKeepRecent(sec);
    if (!clip) {
      onStatus("Nothing in the recent buffer to keep.");
      return;
    }
    await persist(clip);
    onStatus(`Kept “${clip.name}” (${sec}s).`);
  };

  const keepBeats = async (beats: number) => {
    const sec = (beats * 60) / Math.max(40, bpm);
    await keepRecent(sec);
  };

  const toggleTake = () => {
    if (takeActive) {
      const clip = onStopTake();
      if (clip) {
        void persist(clip).then(() => onStatus(`Captured take “${clip.name}”.`));
      } else {
        onStatus("Empty take discarded.");
      }
    } else {
      onStartTake();
      onStatus("Capturing take — play freely, then Stop take.");
    }
  };

  const audition = async () => {
    if (!selected) return;
    if (playerRef.current.isPlaying()) {
      playerRef.current.stop();
      setAuditioning(false);
      return;
    }
    setAuditioning(true);
    await playerRef.current.play(selected, {
      adapter,
      onEnded: () => setAuditioning(false),
    });
  };

  const updateTrim = async (start: number, end: number) => {
    if (!selected) return;
    const next: WriteClip = {
      ...selected,
      trimStartSec: Math.max(0, start),
      trimEndSec: Math.max(start + 0.05, end),
    };
    await persist(next);
  };

  const rename = async (name: string) => {
    if (!selected) return;
    await persist({ ...selected, name: name.trim() || selected.name });
  };

  const discard = async () => {
    if (!selected) return;
    playerRef.current.stop();
    setAuditioning(false);
    await deleteClip(selected.id);
    onStatus(`Discarded “${selected.name}”.`);
    await reload();
  };

  const insert = () => {
    if (!selected) return;
    onInsert(selected);
  };

  const saveToFp = async () => {
    if (!selected) return;
    const midis = clipToMidiSequence(selected);
    if (!midis.length) {
      onStatus("Clip has no notes to save as a riff.");
      return;
    }
    const genre = GENRES.find((g) => g.id === fpGenre) ?? GENRES[0]!;
    const riff = {
      id: newUserRiffId(),
      name: fpName.trim() || selected.name,
      genre: genre.id,
      scaleId: genre.defaultScale,
      midis,
      createdAt: Date.now(),
    };
    await saveUserRiff(riff);
    setFpOpen(false);
    onStatus(`Saved “${riff.name}” to Free Practice (${genre.name}).`);
  };

  const maxTrim = selected
    ? Math.max(
        selected.trimEndSec,
        selected.events.length ? Math.max(...selected.events.map((e) => e.t)) + 0.1 : 1,
      )
    : 1;

  return (
    <aside className="write-clip-tray" aria-label="Riff clip tray">
      <div className="write-clip-tray-header">
        <h3>Riff tray</h3>
        <span className="muted">Rolling buffer · chop · keep</span>
      </div>

      <div className="write-clip-tray-actions">
        <button type="button" className="btn" onClick={() => void keepBeats(4)}>
          Keep 4 beats
        </button>
        <button type="button" className="btn" onClick={() => void keepBeats(8)}>
          Keep 8 beats
        </button>
        <button type="button" className="btn" onClick={() => void keepBeats(16)}>
          Keep 16 beats
        </button>
        <button type="button" className="btn" onClick={() => void keepRecent(8)}>
          Keep 8s
        </button>
        <button type="button" className="btn" onClick={() => void keepRecent(15)}>
          Keep 15s
        </button>
        <button type="button" className="btn" onClick={() => void keepRecent(30)}>
          Keep 30s
        </button>
        <button
          type="button"
          className={`btn${takeActive ? " primary listening" : ""}`}
          onClick={toggleTake}
        >
          {takeActive ? "Stop take" : "Capture take"}
        </button>
      </div>

      <label className="field inline write-clip-also-save">
        <input
          type="checkbox"
          checked={alsoSaveRecordToTray}
          onChange={(e) => onAlsoSaveRecordToTray(e.target.checked)}
        />
        <span>Also save Record takes to tray</span>
      </label>

      <ul className="write-clip-list" role="list">
        {clips.length === 0 ? (
          <li className="muted">No clips yet — play, then Keep recent or Capture take.</li>
        ) : (
          clips.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className={`btn write-clip-item${c.id === selectedId ? " primary" : ""}`}
                onClick={() => setSelectedId(c.id)}
              >
                <span>{c.name}</span>
                <span className="muted">{clipDurationSec(c).toFixed(1)}s</span>
              </button>
            </li>
          ))
        )}
      </ul>

      {selected ? (
        <div className="write-clip-detail">
          <label className="field">
            <span>Name</span>
            <input
              key={selected.id}
              defaultValue={selected.name}
              onBlur={(e) => void rename(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void rename((e.target as HTMLInputElement).value);
                }
              }}
            />
          </label>
          <div className="write-clip-chop">
            <label className="field inline">
              <span>Start</span>
              <input
                type="range"
                min={0}
                max={maxTrim}
                step={0.01}
                value={selected.trimStartSec}
                onChange={(e) =>
                  void updateTrim(Number(e.target.value), selected.trimEndSec)
                }
              />
            </label>
            <label className="field inline">
              <span>End</span>
              <input
                type="range"
                min={0}
                max={maxTrim}
                step={0.01}
                value={selected.trimEndSec}
                onChange={(e) =>
                  void updateTrim(selected.trimStartSec, Number(e.target.value))
                }
              />
            </label>
            <span className="muted">
              Chop {selected.trimStartSec.toFixed(2)}s – {selected.trimEndSec.toFixed(2)}s
            </span>
          </div>
          <div className="write-clip-detail-actions">
            <button type="button" className="btn" onClick={() => void audition()}>
              {auditioning ? "Stop" : "Audition"}
            </button>
            <button type="button" className="btn primary" onClick={insert}>
              Insert at cursor
            </button>
            <button type="button" className="btn" onClick={() => setFpOpen(true)}>
              Save to Free Practice
            </button>
            <button type="button" className="btn" onClick={() => void discard()}>
              Discard
            </button>
          </div>
        </div>
      ) : null}

      {fpOpen && selected ? (
        <div className="write-modal-backdrop" role="presentation" onClick={() => setFpOpen(false)}>
          <div
            className="write-modal"
            role="dialog"
            aria-label="Save to Free Practice"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="write-modal-header">
              <h2>Save to Free Practice</h2>
              <button type="button" className="btn" onClick={() => setFpOpen(false)}>
                Close
              </button>
            </div>
            <p className="write-modal-lead">
              Saves pitch order for Guided practice ({trimmedClipEvents(selected).filter((e) => e.kind === "note" && e.type === "on").length} notes).
            </p>
            <label className="field">
              <span>Name</span>
              <input
                value={fpName || selected.name}
                onChange={(e) => setFpName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Genre</span>
              <select
                value={fpGenre}
                onChange={(e) => setFpGenre(e.target.value as GenreId)}
              >
                {GENRES.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="btn primary" onClick={() => void saveToFp()}>
              Save riff
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

/** Build a clip from raw buffer events (shared helper for WriteWorkspace). */
export function clipFromEvents(
  events: ReturnType<typeof trimmedClipEvents>,
  bpm: number,
  gridQuarters: number,
  name?: string,
): WriteClip | null {
  if (!events.length) return null;
  return createClip({ name, bpm, gridQuarters, events });
}

export function mergePayloadFromClip(clip: WriteClip, bpm: number, gridQuarters: number) {
  const events = trimmedClipEvents(clip);
  const notes = collapseChords(
    quantizeCapture(events, { bpm, gridQuarters }),
  ).map((n) => ({
    ...n,
    dynamics: velocityToDynamics(n.velocity),
  }));
  const pedals = quantizePedals(events, { bpm, gridQuarters });
  return { notes, pedals };
}
