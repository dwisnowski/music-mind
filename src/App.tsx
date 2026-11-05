import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBestMidiAdapter,
  parseMidiMessage,
  type MidiAdapter,
  type MidiDeviceInfo,
} from "./midi";
import { readScoreFile } from "./score/loadMusicXml";
import { parseMusicXmlTimeline } from "./score/parseMusicXmlTimeline";
import { type SampleScore } from "./score/samples";
import type { Hand, LoadedScore } from "./score/types";
import { FeedbackEngine, type FeedbackState } from "./practice/feedbackEngine";
import { ScorePlayer } from "./audio/scorePlayer";
import { WilliamsLights, loadLightProfile, type LightProfile } from "./lights/williamsLights";
import { ScoreView, type ListenTransport } from "./ui/ScoreView";
import { PianoKeyboard, type KeyVisualState } from "./ui/PianoKeyboard";
import { ConnectPanel } from "./ui/ConnectPanel";
import { LightsPanel } from "./ui/LightsPanel";
import { LibraryBrowser } from "./ui/LibraryBrowser";
import { PianoControlsHelp } from "./ui/PianoControlsHelp";
import {
  ControlKeyHandler,
  isReservedControlMidi,
  type ControlAction,
} from "./input/controlKeys";

const DOCK_PIN_KEY = "music-mind-dock-pinned";
const PIANO_CONTROLS_KEY = "mm.pianoControls";

function loadPianoControlsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(PIANO_CONTROLS_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

export default function App() {
  const engineRef = useRef(new FeedbackEngine());
  const lightsRef = useRef(new WilliamsLights());
  const playerRef = useRef(new ScorePlayer());
  const adapterRef = useRef<MidiAdapter | null>(null);
  const heardRef = useRef(new Set<number>());
  const clickCycleChannelRef = useRef(loadLightProfile().channel);
  const dockRef = useRef<HTMLElement | null>(null);
  const pianoControlsHelpBtnRef = useRef<HTMLButtonElement | null>(null);
  const listenTransportRef = useRef<ListenTransport>("idle");
  const feedbackRef = useRef<FeedbackState | null>(null);
  const listenEventIndexRef = useRef<number | null>(null);
  const pianoControlsEnabledRef = useRef(loadPianoControlsEnabled());
  const controlKeysRef = useRef(new ControlKeyHandler());
  const dispatchControlRef = useRef<(action: ControlAction) => void>(() => {});

  const [adapter, setAdapter] = useState<MidiAdapter | null>(null);
  const [inputs, setInputs] = useState<MidiDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MidiDeviceInfo[]>([]);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [score, setScore] = useState<LoadedScore | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [hand, setHand] = useState<Hand>("both");
  const [heard, setHeard] = useState<Set<number>>(new Set());
  const [listenTransport, setListenTransport] = useState<ListenTransport>("idle");
  const [listenEventIndex, setListenEventIndex] = useState<number | null>(null);
  const [listenBpm, setListenBpm] = useState(80);
  const [lightProfile, setLightProfile] = useState<LightProfile>(() => loadLightProfile());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dockPinned, setDockPinned] = useState(() => {
    try {
      return localStorage.getItem(DOCK_PIN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [pianoControlsEnabled, setPianoControlsEnabled] = useState(loadPianoControlsEnabled);
  const [pianoControlsHelpOpen, setPianoControlsHelpOpen] = useState(false);
  const [dockSpacerPx, setDockSpacerPx] = useState(0);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);

  const closePianoControlsHelp = useCallback(() => {
    setPianoControlsHelpOpen(false);
    pianoControlsHelpBtnRef.current?.focus();
  }, []);

  const listenActive = listenTransport !== "idle";
  const listenPlaying = listenTransport === "playing";

  useEffect(() => {
    listenTransportRef.current = listenTransport;
  }, [listenTransport]);

  useEffect(() => {
    feedbackRef.current = feedback;
  }, [feedback]);

  useEffect(() => {
    listenEventIndexRef.current = listenEventIndex;
  }, [listenEventIndex]);

  useEffect(() => {
    pianoControlsEnabledRef.current = pianoControlsEnabled;
    if (!pianoControlsEnabled) controlKeysRef.current.clear();
  }, [pianoControlsEnabled]);

  useEffect(() => {
    const player = playerRef.current;
    return () => player.stop({ emitEnded: false });
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    return engine.subscribe(setFeedback);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const a = await createBestMidiAdapter();
      if (cancelled) return;
      adapterRef.current = a;
      setAdapter(a);
      lightsRef.current.setAdapter(a);
      return a.onMessage((data) => {
        const msg = parseMidiMessage(data);
        if (!msg) return;
        if (msg.type === "noteon") {
          if (pianoControlsEnabledRef.current) {
            const result = controlKeysRef.current.handleNoteOn(msg.note);
            if (result.consumed) {
              if (result.action) dispatchControlRef.current(result.action);
              return;
            }
          }
          heardRef.current.add(msg.note);
          setHeard(new Set(heardRef.current));
          if (listenTransportRef.current === "idle") {
            engineRef.current.noteOn(msg.note);
          }
        } else {
          if (pianoControlsEnabledRef.current && isReservedControlMidi(msg.note)) {
            return;
          }
          heardRef.current.delete(msg.note);
          setHeard(new Set(heardRef.current));
          if (listenTransportRef.current === "idle") {
            engineRef.current.noteOff(msg.note);
          }
        }
      });
    })();
    return () => {
      cancelled = true;
      adapterRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (listenActive) return;
    if (!feedback) return;
    if (feedback.hinted || feedback.expected.size > 0) {
      const profile = lightsRef.current.getProfile();
      if (profile.mode === "noteOn") {
        lightsRef.current.setExpected(feedback.expected);
      }
    }
    if (feedback.done) lightsRef.current.clear();
  }, [feedback, listenActive]);

  useEffect(() => {
    try {
      localStorage.setItem(DOCK_PIN_KEY, dockPinned ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [dockPinned]);

  useEffect(() => {
    try {
      localStorage.setItem(PIANO_CONTROLS_KEY, pianoControlsEnabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [pianoControlsEnabled]);

  useEffect(() => {
    if (!dockPinned) {
      setDockSpacerPx(0);
      return;
    }
    const el = dockRef.current;
    if (!el) return;
    const sync = () => setDockSpacerPx(el.getBoundingClientRect().height);
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dockPinned]);

  const refreshDevices = useCallback(async () => {
    if (!adapterRef.current || adapterRef.current.kind === "none") return;
    try {
      setMidiError(null);
      const [ins, outs] = await Promise.all([
        adapterRef.current.listInputs(),
        adapterRef.current.listOutputs(),
      ]);
      setInputs(ins);
      setOutputs(outs);
    } catch (err) {
      setMidiError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const connect = useCallback(async (inputId?: string, outputId?: string) => {
    if (!adapterRef.current) return;
    try {
      setMidiError(null);
      await adapterRef.current.connect(inputId, outputId);
      const ins = await adapterRef.current.listInputs();
      const chosen = ins.find((d) => d.id === inputId) ?? ins[0];
      setConnectedName(chosen?.name ?? "MIDI device");
      setInputs(ins);
      setOutputs(await adapterRef.current.listOutputs());
      lightsRef.current.setAdapter(adapterRef.current);
    } catch (err) {
      setMidiError(err instanceof Error ? err.message : String(err));
      setConnectedName(null);
    }
  }, []);

  const disconnect = useCallback(() => {
    adapterRef.current?.disconnect();
    lightsRef.current.clear();
    setConnectedName(null);
  }, []);

  const clearListenHeard = useCallback(() => {
    heardRef.current.clear();
    setHeard(new Set());
    lightsRef.current.clear();
  }, []);

  const stopListen = useCallback(() => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    clearListenHeard();
  }, [clearListenHeard]);

  const pauseListen = useCallback(() => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("paused");
    clearListenHeard();
  }, [clearListenHeard]);

  const playListenFrom = useCallback(
    async (startEventIndex: number, options?: { maxEvents?: number }) => {
      if (!score) return;
      const maxEvents = options?.maxEvents;
      lightsRef.current.clear();
      heardRef.current.clear();
      setHeard(new Set());
      setListenTransport("playing");
      setListenEventIndex(startEventIndex);

      try {
        await playerRef.current.play(score, {
          bpm: listenBpm,
          hand: "both",
          startEventIndex,
          maxEvents,
          onEvent: (eventIndex) => setListenEventIndex(eventIndex),
          onNote: (midi, on, staffIndex) => {
            if (on) heardRef.current.add(midi);
            else heardRef.current.delete(midi);
            setHeard(new Set(heardRef.current));

            const profile = lightsRef.current.getProfile();
            if (profile.mode !== "noteOn") return;
            const channel = staffIndex === 0 ? profile.trebleChannel : profile.bassChannel;
            lightsRef.current.lightNote(midi, on, channel);
          },
          onEnded: () => {
            if (maxEvents != null) {
              setListenTransport("paused");
              heardRef.current.clear();
              setHeard(new Set());
              lightsRef.current.clear();
              return;
            }
            setListenTransport("idle");
            setListenEventIndex(null);
            heardRef.current.clear();
            setHeard(new Set());
            lightsRef.current.clear();
          },
        });
      } catch (err) {
        setListenTransport("idle");
        setListenEventIndex(null);
        lightsRef.current.clear();
        setMidiError(err instanceof Error ? err.message : String(err));
      }
    },
    [score, listenBpm],
  );

  const togglePlayPause = useCallback(() => {
    if (!score) return;
    if (listenTransportRef.current === "playing") {
      pauseListen();
      return;
    }
    if (listenTransportRef.current === "paused" && listenEventIndexRef.current != null) {
      void playListenFrom(listenEventIndexRef.current);
      return;
    }
    const start = feedbackRef.current?.eventIndex ?? 0;
    void playListenFrom(start);
  }, [score, pauseListen, playListenFrom]);

  const playNextEvents = useCallback(
    (n: number) => {
      if (!score) return;
      let start: number;
      if (listenTransportRef.current === "playing") {
        start = listenEventIndexRef.current ?? feedbackRef.current?.eventIndex ?? 0;
        playerRef.current.stop({ emitEnded: false });
      } else if (
        listenTransportRef.current === "paused" &&
        listenEventIndexRef.current != null
      ) {
        start = listenEventIndexRef.current;
      } else {
        start = feedbackRef.current?.eventIndex ?? 0;
      }
      void playListenFrom(start, { maxEvents: n });
    },
    [score, playListenFrom],
  );

  useEffect(() => {
    dispatchControlRef.current = (action: ControlAction) => {
      switch (action) {
        case "reset":
          if (listenTransportRef.current !== "idle") return;
          engineRef.current.reset();
          break;
        case "stepBack":
          engineRef.current.stepBy(-1);
          break;
        case "stepForward":
          engineRef.current.stepBy(1);
          break;
        case "playPause":
          togglePlayPause();
          break;
        case "next10":
          playNextEvents(10);
          break;
        case "stop":
          stopListen();
          break;
      }
    };
  }, [togglePlayPause, playNextEvents, stopListen]);

  const onSeekListen = useCallback(
    (eventIndex: number) => {
      if (!score) return;
      const clamped = Math.min(Math.max(0, eventIndex), Math.max(0, score.events.length - 1));
      setListenEventIndex(clamped);

      if (listenTransportRef.current === "playing") {
        void playListenFrom(clamped);
        return;
      }
      // idle or paused → park Listen cursor without auto-starting
      playerRef.current.stop({ emitEnded: false });
      setListenTransport("paused");
      lightsRef.current.clear();
    },
    [score, playListenFrom],
  );

  const onSeekPractice = useCallback((eventIndex: number) => {
    engineRef.current.seek(eventIndex);
  }, []);

  const goHome = useCallback(() => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    heardRef.current.clear();
    setHeard(new Set());
    lightsRef.current.clear();
    engineRef.current.unload();
    setScore(null);
  }, []);

  const onLoadFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      setMidiError(null);
      playerRef.current.stop({ emitEnded: false });
      setListenTransport("idle");
      setListenEventIndex(null);
      lightsRef.current.clear();
      const xml = await readScoreFile(file);
      const loaded = parseMusicXmlTimeline(xml, file.name);
      if (loaded.events.length === 0) {
        throw new Error("No playable notes found in this score.");
      }
      setScore(loaded);
      engineRef.current.load(loaded, hand);
      setSettingsOpen(false);
    } catch (err) {
      setMidiError(err instanceof Error ? err.message : String(err));
    }
  }, [hand]);

  const onLoadSample = useCallback(
    async (sample: SampleScore) => {
      setLoadingSampleId(sample.id);
      try {
        const res = await fetch(sample.path);
        if (!res.ok) {
          setMidiError(`Could not load “${sample.title}”.`);
          return;
        }
        const buffer = await res.arrayBuffer();
        const fileName = sample.path.split("/").pop() ?? `${sample.id}.musicxml`;
        const type = fileName.endsWith(".mxl")
          ? "application/vnd.recordare.musicxml"
          : "application/xml";
        await onLoadFile(new File([buffer], fileName, { type }));
      } catch (err) {
        setMidiError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoadingSampleId(null);
      }
    },
    [onLoadFile],
  );

  const onHandChange = useCallback((next: Hand) => {
    setHand(next);
    engineRef.current.setHand(next);
  }, []);

  const keyStates = useMemo(() => {
    const map = new Map<number, KeyVisualState>();
    if (feedback && !listenActive) {
      for (const n of feedback.expected) {
        map.set(n, feedback.hinted ? "expected" : feedback.heldCorrect.has(n) ? "correct" : "expected");
      }
      for (const n of feedback.heldCorrect) map.set(n, "correct");
      for (const n of feedback.wrongFlash) map.set(n, "wrong");
    }
    for (const n of heard) {
      if (!map.has(n) || map.get(n) === "idle") map.set(n, "heard");
      else if (map.get(n) === "expected") map.set(n, "correct");
    }
    return map;
  }, [feedback, heard, listenActive]);

  const onLightProfile = useCallback((profile: LightProfile) => {
    setLightProfile(profile);
    lightsRef.current.setProfile(profile);
  }, []);

  const onPianoKeyClick = useCallback((midi: number) => {
    if (pianoControlsEnabledRef.current) {
      const result = controlKeysRef.current.handleNoteOn(midi);
      if (result.consumed) {
        if (result.action) dispatchControlRef.current(result.action);
        return;
      }
    }

    if (listenTransportRef.current === "idle") {
      engineRef.current.noteOn(midi);
    }
    heardRef.current.add(midi);
    setHeard(new Set(heardRef.current));

    const profile = lightsRef.current.getProfile();
    if (profile.mode === "noteOn") {
      const ch = clickCycleChannelRef.current & 0x0f;
      lightsRef.current.pulseProbe(midi, ch, 120);
      clickCycleChannelRef.current = (ch + 1) & 0x0f;
    }

    window.setTimeout(() => {
      heardRef.current.delete(midi);
      setHeard(new Set(heardRef.current));
      if (listenTransportRef.current === "idle") {
        engineRef.current.noteOff(midi);
      }
    }, 120);
  }, []);

  const playPauseLabel = listenPlaying ? "Pause" : "Play";
  const playPauseTitle = listenPlaying
    ? "Pause Listen (keeps amber cursor)"
    : listenTransport === "paused"
      ? "Resume Listen from amber cursor"
      : "Play remaining score from the practice cursor (does not move practice)";

  return (
    <div className="app">
      <header className="topbar">
        <a
          className="wiz-home"
          href="https://www.wildideazone.com/"
          title="Wild Idea Zone: more projects"
        >
          <img src="/wild-idea-zone.svg" alt="Wild Idea Zone" width="28" height="28" />
        </a>
        <h1 className="brand">
          <button
            type="button"
            className="brand-home"
            onClick={goHome}
            title="Back to all scores"
            aria-label="Music Mind — back to all scores"
          >
            Music Mind
          </button>
        </h1>
        <div className="topbar-actions">
          <button
            type="button"
            className="btn"
            onClick={goHome}
            title="Browse scores"
            disabled={!score}
          >
            Library
          </button>
          <label className="btn primary file-btn">
            Load score
            <input
              type="file"
              accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
              hidden
              onChange={(e) => void onLoadFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            className="btn"
            onClick={() => {
              void refreshDevices().then(() => setSettingsOpen(true));
            }}
          >
            Connect
          </button>
          <button type="button" className="btn ghost" onClick={() => setSettingsOpen((v) => !v)}>
            Settings
          </button>
        </div>
      </header>

      {settingsOpen && (
        <aside className="settings-drawer">
          <ConnectPanel
            adapter={adapter}
            connectedName={connectedName}
            inputs={inputs}
            outputs={outputs}
            error={midiError}
            onConnect={(i, o) => void connect(i, o)}
            onDisconnect={disconnect}
            onRefresh={() => void refreshDevices()}
            onOpenBluetooth={
              adapter?.openBluetoothPicker
                ? () => void adapter.openBluetoothPicker?.()
                : undefined
            }
          />
          <LightsPanel
            profile={lightProfile}
            onChange={onLightProfile}
            onProbeChannel={() => lightsRef.current.pulseProbe()}
            onProbeAll={() => lightsRef.current.probeAllChannels()}
          />
        </aside>
      )}

      <main className="stage">
        {score ? (
          <div className="score-shell">
            <div className="score-listen-bar" aria-label="Listen controls">
              <label className="field inline score-bpm">
                <span>BPM</span>
                <input
                  type="number"
                  min={40}
                  max={200}
                  value={listenBpm}
                  disabled={listenPlaying}
                  onChange={(e) =>
                    setListenBpm(Math.min(200, Math.max(40, Number(e.target.value) || 80)))
                  }
                />
              </label>
              <button
                type="button"
                className={`btn primary score-listen-btn ${listenPlaying ? "listening" : ""}`}
                onClick={togglePlayPause}
                title={playPauseTitle}
              >
                {playPauseLabel}
              </button>
              {listenActive ? (
                <button
                  type="button"
                  className="btn"
                  onClick={stopListen}
                  title="Stop Listen and hide amber cursor (practice stays put)"
                >
                  Stop
                </button>
              ) : null}
            </div>
            <ScoreView
              xml={score.xml}
              events={score.events}
              feedback={feedback}
              listenEventIndex={listenEventIndex}
              listenTransport={listenTransport}
              onSeekListen={onSeekListen}
              onSeekPractice={onSeekPractice}
            />
          </div>
        ) : (
          <div className="empty-score">
            <h2>Load sheet music to practice</h2>
            <p>
              Drop a MusicXML or compressed <code>.mxl</code> file, pick a score from the library,
              connect your Williams piano over MIDI, and play — the cursor waits for the correct notes.
            </p>
            <div className="panel-row wrap" style={{ justifyContent: "center" }}>
              <label className="btn primary file-btn large">
                Choose MusicXML
                <input
                  type="file"
                  accept=".musicxml,.xml,.mxl"
                  hidden
                  onChange={(e) => void onLoadFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <LibraryBrowser
              onSelect={(sample) => void onLoadSample(sample)}
              loadingId={loadingSampleId}
            />
          </div>
        )}
      </main>

      <section
        ref={dockRef}
        className={`dock${dockPinned ? " dock-pinned" : ""}`}
      >
        <div className="dock-controls">
          <p className="status">{feedback?.statusText ?? "Connect MIDI and load a score."}</p>
          <div className="dock-buttons">
            <button
              type="button"
              className={`btn ${listenPlaying ? "listening" : ""}`}
              onClick={togglePlayPause}
              disabled={!score}
              title={playPauseTitle}
            >
              {playPauseLabel}
            </button>
            {listenActive ? (
              <button
                type="button"
                className="btn"
                onClick={stopListen}
                title="Stop Listen and hide amber cursor (practice stays put)"
              >
                Stop
              </button>
            ) : null}
            <label className="field inline">
              <span>BPM</span>
              <input
                type="number"
                min={40}
                max={200}
                value={listenBpm}
                disabled={!score || listenPlaying}
                onChange={(e) => setListenBpm(Math.min(200, Math.max(40, Number(e.target.value) || 80)))}
              />
            </label>
            <button type="button" className="btn" onClick={() => engineRef.current.reset()} disabled={!score || listenActive}>
              Restart
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => engineRef.current.showHint()}
              disabled={!score || feedback?.done || listenActive}
            >
              Show hint
            </button>
            <label className="field inline">
              <span>Hands</span>
              <select value={hand} onChange={(e) => onHandChange(e.target.value as Hand)} disabled={listenActive}>
                <option value="both">Both</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
            <div className="piano-controls-group">
              <label
                className="field inline"
                title="Use extreme piano keys as app controls (A0/B0/C1 and A7/B7/C8)"
              >
                <span>Piano controls</span>
                <input
                  type="checkbox"
                  checked={pianoControlsEnabled}
                  onChange={(e) => setPianoControlsEnabled(e.target.checked)}
                />
              </label>
              <button
                ref={pianoControlsHelpBtnRef}
                type="button"
                className="btn ghost help-btn"
                onClick={() => setPianoControlsHelpOpen(true)}
                title="What are piano controls?"
                aria-label="What are piano controls?"
              >
                ?
              </button>
            </div>
            <button
              type="button"
              className={`btn${dockPinned ? " pinned" : ""}`}
              onClick={() => setDockPinned((v) => !v)}
              title={
                dockPinned
                  ? "Unpin piano — scroll with the page"
                  : "Pin piano to the bottom of the screen while scrolling"
              }
            >
              {dockPinned ? "Unpin" : "Pin"}
            </button>
          </div>
        </div>
        <PianoKeyboard
          states={keyStates}
          onKeyClick={onPianoKeyClick}
          controlsEnabled={pianoControlsEnabled}
        />
      </section>

      <PianoControlsHelp open={pianoControlsHelpOpen} onClose={closePianoControlsHelp} />

      <footer className="wiz-footer">
        A <a href="https://www.wildideazone.com/">Wild Idea Zone</a> project ·{" "}
        <a href="https://www.wildideazone.com/projects/music-mind">About this build</a> ·{" "}
        <a href="https://www.wildideazone.com/projects">More projects</a>
      </footer>
      {dockPinned ? <div className="dock-spacer" style={{ height: dockSpacerPx }} aria-hidden /> : null}
    </div>
  );
}
