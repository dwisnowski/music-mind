import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { ScoreView, type ListenTransport, type WriteNoteClickInfo } from "./ScoreView";
import { SongFormHelper } from "./SongFormHelper";
import { SongFormPicker } from "./SongFormPicker";
import { LibraryBrowser } from "./LibraryBrowser";
import {
  beginPrivateAccessSignIn,
  fetchScoreBytes,
  PRIVATE_SAMPLE_SCORES,
  takePendingPrivateSamplePath,
} from "../score/privateSamples";
import { rememberRecentScore } from "../score/recentScores";
import {
  CaptureSession,
  DOCK_DEFAULT_VELOCITY,
  RollingMidiBuffer,
  createClip,
  type CaptureState,
  WriteCommandStack,
  createBlankDocument,
  documentToDraft,
  draftToDocument,
  deleteDraft,
  downloadMusicXml,
  findWriteNoteIdAt,
  fromMusicXml,
  listDrafts,
  listOrderedWriteNotes,
  presetToSections,
  primarySelectionId,
  saveClip,
  saveDraft,
  toMusicXml,
  writeNoteIsSelected,
  type ArticulationId,
  type DurationId,
  type DynamicId,
  type WriteClip,
  type WriteComplexity,
  type WriteDocument,
  type WriteDraftRecord,
} from "../write";
import { velocityToDynamics } from "../write/quantize";
import { parseMusicXmlTimeline } from "../score/parseMusicXmlTimeline";
import { readScoreFile } from "../score/loadMusicXml";
import type { LoadedScore } from "../score/types";
import type { SampleScore } from "../score/samples";
import type { FeedbackState } from "../practice/feedbackEngine";
import type { SongFormPreset, SongFormSectionDef } from "../write/songForms";
import type { MidiAdapter } from "../midi/types";
import { isPedalController } from "../midi/types";
import { WriteClipTray, mergePayloadFromClip } from "./WriteClipTray";

const DURATION_BUTTONS: { id: DurationId; label: string }[] = [
  { id: "1", label: "1" },
  { id: "1/2", label: "1/2" },
  { id: "1/4", label: "1/4" },
  { id: "1/8", label: "1/8" },
  { id: "1/16", label: "1/16" },
  { id: "1/4.", label: "1/4." },
  { id: "1/8.", label: "1/8." },
];


export interface WriteWorkspaceProps {
  initialXml?: string | null;
  initialTitle?: string;
  listenBpm: number;
  onListenBpm: (bpm: number) => void;
  listenTransport: ListenTransport;
  listenEventIndex: number | null;
  listenMidiSound: boolean;
  onToggleListenMidiSound: () => void;
  onPlayPause: () => void;
  onStopListen: () => void;
  onSeekListen: (eventIndex: number) => void;
  onLoadedScoreChange: (score: LoadedScore | null) => void;
  onExit: () => void;
  /** Wired from App MIDI / piano — step or record (+ velocity / pedal). */
  noteSinkRef: MutableRefObject<{
    noteOn: (midi: number, timestamp?: number, velocity?: number) => void;
    noteOff: (midi: number, timestamp?: number, velocity?: number) => void;
    controlChange?: (controller: number, value: number, timestamp?: number) => void;
  } | null>;
  feedbackPlaceholder: FeedbackState | null;
  midiAdapter?: MidiAdapter | null;
}

export function WriteWorkspace({
  initialXml,
  initialTitle,
  listenBpm,
  onListenBpm,
  listenTransport,
  listenEventIndex,
  listenMidiSound,
  onToggleListenMidiSound,
  onPlayPause,
  onStopListen,
  onSeekListen,
  onLoadedScoreChange,
  onExit: _onExit,
  noteSinkRef,
  feedbackPlaceholder,
  midiAdapter = null,
}: WriteWorkspaceProps) {
  void _onExit; // Leave Write via topbar mode segment
  const initialDoc = useMemo(() => createBlankDocument({ bars: 8 }), []);
  const stackRef = useRef<WriteCommandStack>(null!);
  if (!stackRef.current) {
    stackRef.current = new WriteCommandStack(initialDoc);
  }
  const [doc, setDoc] = useState<WriteDocument>(initialDoc);
  const [contentEpoch, setContentEpoch] = useState(0);
  const [xml, setXml] = useState(() => toMusicXml(initialDoc));
  const [draftId, setDraftId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<WriteDraftRecord[]>([]);
  const [draftsOpen, setDraftsOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [formPickerOpen, setFormPickerOpen] = useState(false);
  const [helperOpen, setHelperOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [entryMode, setEntryMode] = useState<"step" | "record">("step");
  const [captureState, setCaptureState] = useState<CaptureState>("idle");
  const [gridQuarters, setGridQuarters] = useState(0.25);
  const [status, setStatus] = useState("Play notes to write, or choose a song template.");
  const [lyricDraft, setLyricDraft] = useState("");
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [privateAccessHint, setPrivateAccessHint] = useState<string | null>(null);
  const [trayTakeActive, setTrayTakeActive] = useState(false);
  const [alsoSaveRecordToTray, setAlsoSaveRecordToTray] = useState(false);
  const [clipReloadToken, setClipReloadToken] = useState(0);
  const captureRef = useRef(new CaptureSession());
  const trayTakeRef = useRef(new CaptureSession());
  const bufferRef = useRef(new RollingMidiBuffer());
  const chordBufRef = useRef<{ midis: number[]; timer: number | null }>({
    midis: [],
    timer: null,
  });
  const docRef = useRef(doc);
  useEffect(() => {
    docRef.current = doc;
  }, [doc]);

  useEffect(() => {
    return () => {
      bufferRef.current.clear();
      if (captureRef.current.getStatus() !== "idle") captureRef.current.stopRaw();
      if (trayTakeRef.current.getStatus() !== "idle") trayTakeRef.current.stopRaw();
    };
  }, []);

  const refreshXml = useCallback((d: WriteDocument) => {
    const nextXml = toMusicXml(d);
    setXml(nextXml);
    try {
      const loaded = parseMusicXmlTimeline(nextXml, d.title);
      onLoadedScoreChange(loaded);
    } catch {
      onLoadedScoreChange(null);
    }
  }, [onLoadedScoreChange]);

  useEffect(() => {
    const stack = stackRef.current;
    return stack.subscribe((d) => {
      setDoc(d);
      setContentEpoch(stack.contentEpoch);
    });
  }, []);

  // Debounce OSMD refresh only when musical content changes (not bare selection).
  useEffect(() => {
    const t = window.setTimeout(() => refreshXml(docRef.current), 280);
    return () => window.clearTimeout(t);
  }, [contentEpoch, refreshXml]);

  // Autosave
  useEffect(() => {
    const t = window.setTimeout(() => {
      const record = documentToDraft(doc, draftId);
      setDraftId(record.id);
      void saveDraft(record).catch(() => {
        /* ignore */
      });
    }, 1500);
    return () => window.clearTimeout(t);
  }, [doc, draftId]);

  useEffect(() => {
    if (initialXml) {
      try {
        const d = fromMusicXml(initialXml, initialTitle);
        stackRef.current.load(d);
        setDoc(d);
        setStatus(`Editing “${d.title}”.`);
      } catch (err) {
        setStatus(err instanceof Error ? err.message : String(err));
      }
    }
  }, [initialXml, initialTitle]);

  const flushChord = useCallback(() => {
    const buf = chordBufRef.current;
    if (!buf.midis.length) return;
    const midis = [...buf.midis];
    buf.midis = [];
    if (buf.timer != null) {
      window.clearTimeout(buf.timer);
      buf.timer = null;
    }
    stackRef.current.dispatch({ type: "insertNotes", midis });
    setStatus(`Inserted ${midis.length > 1 ? "chord" : "note"}.`);
  }, []);

  const handleNoteOn = useCallback(
    (midi: number, timestamp?: number, velocity?: number) => {
      const vel = velocity ?? DOCK_DEFAULT_VELOCITY;
      const absMs =
        timestamp != null && timestamp > 1000 ? timestamp : performance.now();
      bufferRef.current.pushNote("on", midi, vel, absMs);
      if (trayTakeRef.current.getStatus() === "recording") {
        trayTakeRef.current.noteOn(midi, timestamp, vel);
      }
      if (entryMode === "record") {
        captureRef.current.noteOn(midi, timestamp, vel);
        return;
      }
      const buf = chordBufRef.current;
      buf.midis.push(midi);
      if (buf.timer != null) window.clearTimeout(buf.timer);
      buf.timer = window.setTimeout(() => flushChord(), 40);
    },
    [entryMode, flushChord],
  );

  const handleNoteOff = useCallback(
    (midi: number, timestamp?: number, velocity?: number) => {
      const absMs =
        timestamp != null && timestamp > 1000 ? timestamp : performance.now();
      bufferRef.current.pushNote("off", midi, velocity, absMs);
      if (trayTakeRef.current.getStatus() === "recording") {
        trayTakeRef.current.noteOff(midi, timestamp, velocity);
      }
      if (entryMode === "record") {
        captureRef.current.noteOff(midi, timestamp, velocity);
      }
    },
    [entryMode],
  );

  const handleControlChange = useCallback(
    (controller: number, value: number, timestamp?: number) => {
      if (!isPedalController(controller)) return;
      const absMs =
        timestamp != null && timestamp > 1000 ? timestamp : performance.now();
      bufferRef.current.pushCc(controller, value, absMs);
      if (trayTakeRef.current.getStatus() === "recording") {
        trayTakeRef.current.controlChange(controller, value, timestamp);
      }
      if (entryMode === "record") {
        captureRef.current.controlChange(controller, value, timestamp);
      }
    },
    [entryMode],
  );

  useEffect(() => {
    noteSinkRef.current = {
      noteOn: handleNoteOn,
      noteOff: handleNoteOff,
      controlChange: handleControlChange,
    };
    return () => {
      noteSinkRef.current = null;
    };
  }, [noteSinkRef, handleNoteOn, handleNoteOff, handleControlChange]);

  const reloadDrafts = useCallback(async () => {
    try {
      setDrafts(await listDrafts());
    } catch {
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    if (draftsOpen) void reloadDrafts();
  }, [draftsOpen, reloadDrafts]);

  const events = useMemo(() => {
    try {
      return parseMusicXmlTimeline(xml, doc.title).events;
    } catch {
      return [];
    }
  }, [xml, doc.title]);

  const listenPlaying = listenTransport === "playing";
  const listenActive = listenTransport !== "idle";

  const startBlank = () => {
    const d = createBlankDocument({ title: "Untitled", bars: 8 });
    stackRef.current.load(d);
    setDoc(d);
    setDraftId(null);
    setStatus("Blank score — pick a duration and play.");
  };

  const applyForm = (preset: SongFormPreset, defs: SongFormSectionDef[]) => {
    const sections = presetToSections(preset, defs);
    stackRef.current.dispatch({ type: "applySections", sections, rebuildMeasures: true });
    setFormPickerOpen(false);
    setHelperOpen(true);
    setStatus(`Applied “${preset.name}” form.`);
  };

  const startRecord = async () => {
    setEntryMode("record");
    await captureRef.current.start({
      bpm: listenBpm,
      gridQuarters,
      countInBeats: doc.beats,
      onState: setCaptureState,
      onBeat: (i, countIn) => {
        setStatus(countIn ? `Count-in ${i + 1}` : `Recording beat ${i + 1}`);
      },
    });
  };

  const stopRecord = () => {
    const result = captureRef.current.stopCollapsed();
    setCaptureState("idle");
    if (!result.collapsed.length && !result.pedals.length) {
      setStatus("Nothing recorded.");
      setEntryMode("step");
      return;
    }
    const notes = result.collapsed.map((n) => ({
      ...n,
      dynamics: velocityToDynamics(n.velocity),
    }));
    stackRef.current.dispatch({
      type: "mergeRecorded",
      notes,
      pedals: result.pedals,
      fromMeasure: docRef.current.cursor.measureIndex,
    });
    if (alsoSaveRecordToTray && result.events.length) {
      const clip = createClip({
        bpm: listenBpm,
        gridQuarters,
        events: result.events,
        name: `Record ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
      });
      void saveClip(clip)
        .then(() => setClipReloadToken((n) => n + 1))
        .catch(() => {
          /* ignore */
        });
    }
    setStatus(
      `Merged ${result.collapsed.length} quantized event(s)` +
        (result.pedals.length ? ` · ${result.pedals.length} pedal mark(s)` : "") +
        ".",
    );
    setEntryMode("step");
  };

  const onKeepRecent = useCallback(
    (sec: number): WriteClip | null => {
      const events = bufferRef.current.sliceLast(sec);
      if (!events.length) return null;
      return createClip({ bpm: listenBpm, gridQuarters, events });
    },
    [listenBpm, gridQuarters],
  );

  const onStartTake = useCallback(() => {
    setTrayTakeActive(true);
    void trayTakeRef.current.start({
      bpm: listenBpm,
      gridQuarters,
      countInBeats: 0,
      metronome: false,
      onState: (s) => {
        if (s === "idle") setTrayTakeActive(false);
      },
    });
  }, [listenBpm, gridQuarters]);

  const onStopTake = useCallback((): WriteClip | null => {
    const events = trayTakeRef.current.stopRaw();
    setTrayTakeActive(false);
    if (!events.length) return null;
    return createClip({ bpm: listenBpm, gridQuarters, events });
  }, [listenBpm, gridQuarters]);

  const onInsertClip = useCallback(
    (clip: WriteClip) => {
      const { notes, pedals } = mergePayloadFromClip(clip, listenBpm, gridQuarters);
      if (!notes.length && !pedals.length) {
        setStatus("Clip has nothing to insert after quantize.");
        return;
      }
      stackRef.current.dispatch({
        type: "mergeRecorded",
        notes,
        pedals,
        fromMeasure: docRef.current.cursor.measureIndex,
      });
      setStatus(
        `Inserted “${clip.name}” (${notes.length} event(s)` +
          (pedals.length ? `, ${pedals.length} pedal(s)` : "") +
          ").",
      );
    },
    [listenBpm, gridQuarters],
  );

  const openDraft = (record: WriteDraftRecord) => {
    const d = draftToDocument(record);
    stackRef.current.load(d);
    setDoc(d);
    setDraftId(record.id);
    setDraftsOpen(false);
    setStatus(`Opened draft “${d.title}”.`);
  };

  const loadXmlString = (xmlStr: string, title?: string) => {
    const d = fromMusicXml(xmlStr, title);
    stackRef.current.load(d);
    setDoc(d);
    setDraftId(null);
    setLibraryOpen(false);
    setStatus(`Loaded “${d.title}” into Write.`);
  };

  const onLoadFile = async (file: File | null): Promise<boolean> => {
    if (!file) return false;
    try {
      const xmlStr = await readScoreFile(file);
      loadXmlString(xmlStr, file.name);
      return true;
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
      return false;
    }
  };

  const onPrivateSignIn = () => {
    beginPrivateAccessSignIn();
  };

  const onLoadSample = useCallback(async (sample: SampleScore) => {
    setLoadingSampleId(sample.id);
    setPrivateAccessHint(null);
    try {
      const result = await fetchScoreBytes(sample.path);
      if (result.kind === "needs-sign-in") {
        beginPrivateAccessSignIn(sample.path);
        return;
      }
      if (result.kind === "forbidden") {
        setPrivateAccessHint(result.message);
        setStatus(result.message);
        return;
      }
      if (result.kind === "error") {
        throw new Error(`Could not load “${sample.title}”.`);
      }
      const buffer = result.buffer;
      const fileName =
        decodeURIComponent(sample.path.split("/").pop() ?? "") || `${sample.id}.musicxml`;
      const lower = fileName.toLowerCase();
      const type = lower.endsWith(".mxl")
        ? "application/vnd.recordare.musicxml"
        : "application/vnd.recordare.musicxml+xml";
      const opened = await onLoadFile(new File([buffer], fileName, { type }));
      if (opened) rememberRecentScore(sample);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSampleId(null);
    }
  }, []);

  useEffect(() => {
    const path = takePendingPrivateSamplePath();
    if (!path) return;
    const sample = PRIVATE_SAMPLE_SCORES.find((s) => s.path === path);
    if (sample) void onLoadSample(sample);
  }, [onLoadSample]);

  const orderedNotes = useMemo(() => listOrderedWriteNotes(doc), [doc]);
  const selectedIdSet = useMemo(() => new Set(doc.selectionIds), [doc.selectionIds]);
  const hasSelection = doc.selectionIds.length > 0;
  const primaryId = primarySelectionId(doc);

  const selectedNote = useMemo(() => {
    if (!primaryId) return null;
    for (const m of doc.measures) {
      const n = m.notes.find((x) => x.id === primaryId);
      if (n) return n;
    }
    return null;
  }, [doc, primaryId]);

  useEffect(() => {
    setLyricDraft(selectedNote?.lyric?.text ?? "");
  }, [selectedNote?.id, selectedNote?.lyric?.text]);

  const resolveNoteId = useCallback(
    (info: WriteNoteClickInfo) =>
      findWriteNoteIdAt(orderedNotes, info.absoluteOnset, info.midi, info.staffIndex),
    [orderedNotes],
  );

  const noteIsSelected = useCallback(
    (info: { absoluteOnset: number; midi: number | null; staffIndex: number | null }) =>
      writeNoteIsSelected(
        orderedNotes,
        selectedIdSet,
        info.absoluteOnset,
        info.midi,
        info.staffIndex,
      ),
    [orderedNotes, selectedIdSet],
  );

  const onSelectNote = useCallback((noteId: string, info: WriteNoteClickInfo) => {
    const mode =
      info.shiftKey ? "range" : info.metaKey || info.ctrlKey ? "toggle" : "replace";
    const found = orderedNotes.find((n) => n.id === noteId);
    if (found) {
      stackRef.current.dispatch({
        type: "setCursor",
        measureIndex: found.measureIndex,
        onsetQuarters: found.onsetInMeasure,
        staffIndex: found.note.staffIndex,
        voice: found.note.voice,
      });
    }
    stackRef.current.dispatch({ type: "select", noteId, mode });
    const count = stackRef.current.document.selectionIds.length;
    setStatus(
      count
        ? `${count} note${count === 1 ? "" : "s"} selected. Delete, ↑/↓ shift, or pick a duration.`
        : "Selection cleared.",
    );
  }, [orderedNotes]);

  const applyDuration = useCallback(
    (duration: DurationId) => {
      if (hasSelection) {
        stackRef.current.dispatch({ type: "setSelectionDuration", duration });
        setStatus(`Set duration to ${duration} on ${doc.selectionIds.length} note(s).`);
        return;
      }
      stackRef.current.dispatch({ type: "setStepDuration", duration });
    },
    [doc.selectionIds.length, hasSelection],
  );

  const shiftSelection = useCallback(
    (semitones: number) => {
      if (!hasSelection) return;
      stackRef.current.dispatch({ type: "shiftSelection", semitones });
      const dir = semitones > 0 ? "up" : "down";
      const amount = Math.abs(semitones);
      setStatus(
        `Shifted ${doc.selectionIds.length} note(s) ${dir} ${amount} semitone${amount === 1 ? "" : "s"}.`,
      );
    },
    [doc.selectionIds.length, hasSelection],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      if (!hasSelection) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        stackRef.current.dispatch({ type: "deleteSelection" });
        setStatus("Deleted selection.");
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        stackRef.current.dispatch({ type: "select", noteId: null });
        setStatus("Selection cleared.");
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        shiftSelection(e.shiftKey ? 12 : 1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        shiftSelection(e.shiftKey ? -12 : -1);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [hasSelection, shiftSelection]);

  const writeSelection = useMemo(
    () => ({
      selectedIds: doc.selectionIds,
      resolveNoteId,
      noteIsSelected,
      onSelect: onSelectNote,
    }),
    [doc.selectionIds, noteIsSelected, onSelectNote, resolveNoteId],
  );

  const complexity: WriteComplexity = doc.writeMode;
  const showLyrics = complexity === "lyrics" || complexity === "advanced";
  const showAdvanced = complexity === "advanced";

  return (
    <div className="write-workspace">
      <div className="write-floating-chrome">
        <div className="score-listen-bar" aria-label="Listen controls">
          <label className="field inline score-bpm">
            <span>BPM</span>
            <input
              type="number"
              min={40}
              max={200}
              value={listenBpm}
              disabled={listenPlaying || captureState !== "idle"}
              onChange={(e) => {
                const bpm = Math.min(200, Math.max(40, Number(e.target.value) || 80));
                onListenBpm(bpm);
                stackRef.current.dispatch({ type: "setMeta", bpm });
              }}
            />
          </label>
          <button
            type="button"
            className={`btn score-listen-sound-btn ${listenMidiSound ? "active" : ""}`}
            aria-pressed={listenMidiSound}
            aria-label={
              listenMidiSound
                ? "Piano MIDI sound on — Listen plays on your piano"
                : "Piano MIDI sound off"
            }
            title={
              listenMidiSound
                ? "Piano sound on: Listen sends MIDI so your piano plays"
                : "Piano sound off: Listen uses computer speakers only"
            }
            onClick={onToggleListenMidiSound}
          >
            {listenMidiSound ? (
              <svg
                className="score-listen-sound-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.74 2.5-2.26 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"
                />
              </svg>
            ) : (
              <svg
                className="score-listen-sound-icon"
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z"
                />
              </svg>
            )}
          </button>
          <button
            type="button"
            className={`btn primary score-listen-btn ${listenPlaying ? "listening" : ""}`}
            onClick={onPlayPause}
          >
            {listenPlaying ? "Pause" : "Play"}
          </button>
          {listenActive ? (
            <button type="button" className="btn" onClick={onStopListen}>
              Stop
            </button>
          ) : null}
        </div>
      </div>

      <div className="write-toolbar">
        <label className="field inline write-mode-toolbar">
          <span>Mode</span>
          <select
            value={doc.writeMode}
            onChange={(e) =>
              stackRef.current.dispatch({
                type: "setWriteMode",
                writeMode: e.target.value as WriteComplexity,
              })
            }
          >
            <option value="simple">Simple</option>
            <option value="lyrics">Simple + lyrics</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <input
          className="write-title"
          value={doc.title}
          onChange={(e) =>
            stackRef.current.dispatch({ type: "setMeta", title: e.target.value })
          }
          aria-label="Score title"
        />
        <button type="button" className="btn primary" onClick={() => setFormPickerOpen(true)}>
          Song template
        </button>
        <details className="write-file-menu">
          <summary className="btn">File</summary>
          <div className="write-file-menu-panel" role="menu">
            <button type="button" className="btn" role="menuitem" onClick={startBlank}>
              Blank
            </button>
            <button
              type="button"
              className="btn"
              role="menuitem"
              onClick={() => setLibraryOpen((v) => !v)}
            >
              Open library
            </button>
            <label className="btn file-btn" role="menuitem">
              Open file
              <input
                type="file"
                accept=".musicxml,.xml,.mxl"
                hidden
                onChange={(e) => void onLoadFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="button"
              className="btn"
              role="menuitem"
              onClick={() => setDraftsOpen((v) => !v)}
            >
              Drafts
            </button>
            <button
              type="button"
              className="btn"
              role="menuitem"
              onClick={() => void downloadMusicXml(doc, false)}
            >
              Download
            </button>
            <button
              type="button"
              className="btn"
              role="menuitem"
              onClick={() => void downloadMusicXml(doc, true)}
            >
              Download .mxl
            </button>
          </div>
        </details>
      </div>

      <div className="write-tools">
        <div className="write-note-group" role="group" aria-label="Note writing">
          <span className="write-note-group-label">Notes</span>
          <details className="write-select-help">
            <summary
              className="btn write-select-help-btn"
              title="How to select and edit notes"
              aria-label="How to select and edit notes"
            >
              ?
            </summary>
            <div className="write-select-help-panel" role="note">
              <p className="write-select-help-title">Select notes on the score</p>
              <ul>
                <li>
                  <kbd>Click</kbd> a note to select it (highlighted in teal).
                </li>
                <li>
                  <kbd>Shift</kbd>+click to select a sequential range from the
                  first selection.
                </li>
                <li>
                  <kbd>Ctrl</kbd> / <kbd>⌘</kbd>+click to add or remove
                  non-sequential notes.
                </li>
                <li>
                  <kbd>Esc</kbd> clears the selection.
                </li>
              </ul>
              <p className="write-select-help-title">Edit the selection</p>
              <ul>
                <li>
                  <strong>Delete</strong> or <kbd>Delete</kbd> / <kbd>Backspace</kbd>{" "}
                  removes selected notes.
                </li>
                <li>
                  <strong>↑</strong> / <strong>↓</strong> (or arrow keys) shift pitch
                  by a semitone; <kbd>Shift</kbd>+arrow shifts by an octave.
                </li>
                <li>
                  Duration buttons (<strong>1</strong>, <strong>1/2</strong>,{" "}
                  <strong>1/4</strong>, <strong>1/8</strong>, …) change the selected
                  notes’ length.
                </li>
              </ul>
            </div>
          </details>
          <div className="write-duration-palette" role="group" aria-label="Note tools">
            <div className="mode-group write-duration-group" role="group" aria-label="Note duration">
              {DURATION_BUTTONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={`btn mode-seg${doc.stepDuration === d.id ? " primary" : ""}`}
                  title={
                    hasSelection
                      ? `Set selected note(s) to ${d.label}`
                      : `Step-entry duration ${d.label}`
                  }
                  onClick={() => applyDuration(d.id)}
                >
                  {d.label}
                </button>
              ))}
              <button
                type="button"
                className="btn mode-seg"
                title="Insert a rest at the cursor"
                onClick={() => stackRef.current.dispatch({ type: "insertRest" })}
              >
                Rest
              </button>
            </div>
            <button
              type="button"
              className={`btn${doc.tieNext ? " primary" : ""}`}
              onClick={() =>
                stackRef.current.dispatch({ type: "setTieNext", tieNext: !doc.tieNext })
              }
              title="Tie next note"
            >
              Tie
            </button>
            <button
              type="button"
              className="btn"
              disabled={!hasSelection}
              title="Shift selection down a semitone (↓)"
              onClick={() => shiftSelection(-1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="btn"
              disabled={!hasSelection}
              title="Shift selection up a semitone (↑)"
              onClick={() => shiftSelection(1)}
            >
              ↑
            </button>
            <button type="button" className="btn" onClick={() => stackRef.current.undo()}>
              Undo
            </button>
            <button type="button" className="btn" onClick={() => stackRef.current.redo()}>
              Redo
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                stackRef.current.dispatch({ type: "deleteSelection" });
                setStatus("Deleted selection.");
              }}
              disabled={!hasSelection}
              title="Delete selected notes (Delete)"
            >
              Delete{hasSelection && doc.selectionIds.length > 1 ? ` (${doc.selectionIds.length})` : ""}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => stackRef.current.dispatch({ type: "deleteBackward" })}
            >
              ⌫
            </button>
          </div>
        </div>

        <span className="write-tools-sep" aria-hidden="true" />

        <div className="mode-group write-entry-group" role="group" aria-label="Entry mode">
          <button
            type="button"
            className={`btn mode-seg${entryMode === "step" && captureState === "idle" ? " primary" : ""}`}
            onClick={() => {
              if (captureState !== "idle") stopRecord();
              setEntryMode("step");
            }}
            title="Insert notes one at a time from the keyboard"
          >
            Step
          </button>
          {captureState === "idle" ? (
            <button
              type="button"
              className={`btn mode-seg${entryMode === "record" ? " primary" : ""}`}
              onClick={() => void startRecord()}
              title="Record with metronome and quantize into the score"
            >
              Record
            </button>
          ) : (
            <button
              type="button"
              className="btn mode-seg primary listening"
              onClick={stopRecord}
              title="Stop recording and merge into the score"
            >
              Stop ({captureState})
            </button>
          )}
        </div>
        <button
          type="button"
          className={`btn${trayOpen || trayTakeActive ? " primary" : ""}`}
          aria-pressed={trayOpen}
          onClick={() => setTrayOpen((v) => !v)}
          title="Keep and chop recent playing"
        >
          Riff tray
        </button>
        {doc.sections.length > 0 ? (
          <button
            type="button"
            className={`btn${helperOpen ? " primary" : ""}`}
            aria-pressed={helperOpen}
            onClick={() => setHelperOpen((v) => !v)}
          >
            Form helper
          </button>
        ) : null}
      </div>

      {showLyrics ? (
        <div className="write-lyrics-bar">
          <label className="field inline grow">
            <span>Lyric</span>
            <input
              value={lyricDraft}
              disabled={!selectedNote || selectedNote.kind === "rest"}
              placeholder={selectedNote ? "Syllable for selected note" : "Select a note"}
              onChange={(e) => setLyricDraft(e.target.value)}
              onBlur={() => {
                if (!selectedNote) return;
                stackRef.current.dispatch({
                  type: "setLyric",
                  noteId: selectedNote.id,
                  lyric: lyricDraft.trim()
                    ? { text: lyricDraft.trim(), syllabic: "single" }
                    : undefined,
                });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && selectedNote) {
                  stackRef.current.dispatch({
                    type: "setLyric",
                    noteId: selectedNote.id,
                    lyric: lyricDraft.trim()
                      ? { text: lyricDraft.trim(), syllabic: "single" }
                      : undefined,
                  });
                }
              }}
            />
          </label>
        </div>
      ) : null}

      {showAdvanced ? (
        <div className="write-advanced-bar">
          <span className="muted">Advanced</span>
          {(
            [
              ["staccato", "Staccato"],
              ["accent", "Accent"],
              ["tenuto", "Tenuto"],
              ["strong-accent", "Marcato"],
            ] as [ArticulationId, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="btn"
              disabled={!selectedNote || selectedNote.kind === "rest"}
              onClick={() => {
                if (!selectedNote) return;
                const cur = new Set(selectedNote.articulations ?? []);
                if (cur.has(id)) cur.delete(id);
                else cur.add(id);
                stackRef.current.dispatch({
                  type: "setArticulations",
                  noteId: selectedNote.id,
                  articulations: [...cur],
                });
              }}
            >
              {label}
            </button>
          ))}
          {(
            [
              ["pp", "pp"],
              ["p", "p"],
              ["mp", "mp"],
              ["mf", "mf"],
              ["f", "f"],
              ["ff", "ff"],
            ] as [DynamicId, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="btn"
              disabled={!selectedNote}
              onClick={() => {
                if (!selectedNote) return;
                stackRef.current.dispatch({
                  type: "setDynamics",
                  noteId: selectedNote.id,
                  dynamics: id,
                });
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="btn"
            disabled={!selectedNote}
            onClick={() => {
              if (!selectedNote) return;
              stackRef.current.dispatch({
                type: "setBeam",
                noteId: selectedNote.id,
                beam: selectedNote.beam === "begin" ? "continue" : selectedNote.beam === "continue" ? "end" : "begin",
              });
            }}
          >
            Beam cycle
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selectedNote}
            onClick={() => {
              if (!selectedNote) return;
              stackRef.current.dispatch({
                type: "setTuplet",
                noteId: selectedNote.id,
                tuplet: selectedNote.tuplet
                  ? undefined
                  : { actual: 3, normal: 2, place: "start" },
              });
            }}
          >
            Triplet
          </button>
          <button
            type="button"
            className="btn"
            disabled={!selectedNote}
            onClick={() => {
              if (!selectedNote) return;
              const staff = selectedNote.staffIndex === 0 ? 1 : 0;
              stackRef.current.dispatch({
                type: "setNoteStaff",
                noteId: selectedNote.id,
                staffIndex: staff,
              });
            }}
          >
            Flip staff
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              stackRef.current.dispatch({
                type: "togglePickup",
                measureIndex: doc.cursor.measureIndex,
              })
            }
          >
            Pickup bar
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              stackRef.current.dispatch({
                type: "setMeasureRepeat",
                measureIndex: doc.cursor.measureIndex,
                forward: true,
              })
            }
          >
            |: start
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              stackRef.current.dispatch({
                type: "setMeasureRepeat",
                measureIndex: doc.cursor.measureIndex,
                backward: true,
                times: 2,
              })
            }
          >
            :| end
          </button>
          <button
            type="button"
            className="btn"
            onClick={() =>
              stackRef.current.dispatch({
                type: "setMeasureRepeat",
                measureIndex: doc.cursor.measureIndex,
                volta: [1],
              })
            }
          >
            Volta 1
          </button>
        </div>
      ) : null}

      <p className="write-status">
        {status}
        {hasSelection ? (
          <span className="muted">
            {" "}
            · Click / Shift+click / Ctrl·⌘+click · ↑↓ shift · duration buttons edit selection
          </span>
        ) : null}
      </p>

      <div
        className={`write-body${trayOpen ? " with-clip-tray" : ""}${
          helperOpen && doc.sections.length > 0 ? " with-helper" : ""
        }`}
      >
        <div className="write-score-pane">
          <div className="write-score-pane-bar">
            <label className="field inline write-score-grid">
              <span>Grid</span>
              <select
                value={String(gridQuarters)}
                onChange={(e) => setGridQuarters(Number(e.target.value))}
              >
                <option value="1">Quarter</option>
                <option value="0.5">Eighth</option>
                <option value="0.25">16th</option>
              </select>
            </label>
            <p className="muted write-cursor-hint">
              Bar {doc.cursor.measureIndex + 1} · {doc.stepDuration}
              {hasSelection
                ? ` · ${doc.selectionIds.length} selected`
                : ""}
              {doc.sections.length ? ` · ${doc.sections.length} sections` : ""}
            </p>
          </div>
          <ScoreView
            xml={xml}
            events={events}
            feedback={feedbackPlaceholder}
            listenEventIndex={listenEventIndex}
            listenTransport={listenTransport}
            onSeekListen={onSeekListen}
            writeSelection={writeSelection}
            onSeekPractice={(eventIndex) => {
              // Map event → approximate measure via timestamp
              const ev = events[eventIndex];
              if (!ev) return;
              const quartersPerBar = doc.beats * (4 / doc.beatType);
              const measureIndex = Math.min(
                doc.measures.length - 1,
                Math.max(0, Math.floor(ev.timestamp / Math.max(0.25, quartersPerBar))),
              );
              stackRef.current.dispatch({ type: "setCursor", measureIndex, onsetQuarters: 0 });
              const m = doc.measures[measureIndex];
              const note = m?.notes[0];
              stackRef.current.dispatch({
                type: "select",
                noteId: note?.id ?? null,
                mode: "replace",
              });
            }}
          />
        </div>
        {trayOpen ? (
          <WriteClipTray
            bpm={listenBpm}
            gridQuarters={gridQuarters}
            adapter={midiAdapter}
            onKeepRecent={onKeepRecent}
            takeActive={trayTakeActive}
            onStartTake={onStartTake}
            onStopTake={onStopTake}
            alsoSaveRecordToTray={alsoSaveRecordToTray}
            onAlsoSaveRecordToTray={setAlsoSaveRecordToTray}
            onInsert={onInsertClip}
            onStatus={setStatus}
            reloadToken={clipReloadToken}
          />
        ) : null}
        {helperOpen && doc.sections.length > 0 ? (
          <SongFormHelper
            sections={doc.sections}
            currentMeasure={doc.cursor.measureIndex}
            writeMode={doc.writeMode}
            onJump={(measureIndex) =>
              stackRef.current.dispatch({ type: "setCursor", measureIndex, onsetQuarters: 0 })
            }
            onToggleChecklist={(sectionId, key) => {
              const sec = doc.sections.find((s) => s.id === sectionId);
              if (!sec) return;
              stackRef.current.dispatch({
                type: "updateSectionChecklist",
                sectionId,
                checklist: { ...sec.checklist, [key]: !sec.checklist[key] },
              });
            }}
            onEditForm={() => setFormPickerOpen(true)}
          />
        ) : null}
      </div>

      {draftsOpen ? (
        <div className="write-drafts-drawer">
          <header className="panel-row">
            <h3>Local drafts</h3>
            <button type="button" className="btn ghost" onClick={() => setDraftsOpen(false)}>
              Close
            </button>
          </header>
          {!drafts.length ? (
            <p className="muted">No drafts yet — they autosave while you write.</p>
          ) : (
            <ul className="write-draft-list">
              {drafts.map((d) => (
                <li key={d.id}>
                  <button type="button" className="linkish" onClick={() => openDraft(d)}>
                    {d.title}
                  </button>
                  <span className="muted">
                    {new Date(d.updatedAt).toLocaleString()}
                  </span>
                  <button
                    type="button"
                    className="btn ghost"
                    onClick={() =>
                      void deleteDraft(d.id).then(() => reloadDrafts())
                    }
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {libraryOpen ? (
        <div className="write-library-drawer">
          <header className="panel-row">
            <h3>Open into Write</h3>
            <button type="button" className="btn ghost" onClick={() => setLibraryOpen(false)}>
              Close
            </button>
          </header>
          <LibraryBrowser
            onSelect={(sample) => void onLoadSample(sample)}
            loadingId={loadingSampleId}
            privateAccessHint={privateAccessHint}
            onPrivateSignIn={onPrivateSignIn}
          />
        </div>
      ) : null}

      <SongFormPicker
        open={formPickerOpen}
        onClose={() => setFormPickerOpen(false)}
        onApply={applyForm}
      />
    </div>
  );
}
