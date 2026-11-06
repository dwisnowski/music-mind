import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBestMidiAdapter,
  parseMidiMessage,
  type MidiAdapter,
  type MidiDeviceInfo,
} from "./midi";
import { MidiNoteOutput } from "./midi/midiNoteOutput";
import { readScoreFile } from "./score/loadMusicXml";
import { parseMusicXmlTimeline } from "./score/parseMusicXmlTimeline";
import { type SampleScore } from "./score/samples";
import type { Hand, LoadedScore } from "./score/types";
import { FeedbackEngine, type FeedbackState } from "./practice/feedbackEngine";
import { ScorePlayer } from "./audio/scorePlayer";
import { PianoClickSynth } from "./audio/pianoClickSynth";
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
import {
  FallingLightsEngine,
  FallingLightsGame,
  FALLING_LEFT_MIDI,
  FALLING_RIGHT_MIDI,
} from "./games/fallingLights";
import {
  EchoGhostEngine,
  EchoGhostGame,
  type EchoGhostSnapshot,
} from "./games/echoGhost";
import {
  BalloonPopEngine,
  BalloonPopGame,
  type BalloonPopSnapshot,
} from "./games/balloonPop";
import { WriteWorkspace } from "./ui/WriteWorkspace";

const DOCK_PIN_KEY = "music-mind-dock-pinned";
const PIANO_CONTROLS_KEY = "mm.pianoControls";
const PIANO_CLICK_SOUND_KEY = "mm.pianoClickSound";
const LISTEN_MIDI_SOUND_KEY = "mm.listenMidiSound";

type AppMode = "practice" | "write" | "fallingLights" | "echoGhost" | "balloonPop";
type GameId = "fallingLights" | "echoGhost" | "balloonPop";

function loadPianoControlsEnabled(): boolean {
  try {
    const raw = localStorage.getItem(PIANO_CONTROLS_KEY);
    if (raw === null) return true;
    return raw === "1";
  } catch {
    return true;
  }
}

function loadSoundEnabled(): boolean {
  try {
    return localStorage.getItem(PIANO_CLICK_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

function loadListenMidiSound(): boolean {
  try {
    return localStorage.getItem(LISTEN_MIDI_SOUND_KEY) === "1";
  } catch {
    return false;
  }
}

export default function App() {
  const engineRef = useRef(new FeedbackEngine());
  const [fallingLightsEngine] = useState(() => new FallingLightsEngine());
  const fallingLightsRef = useRef(fallingLightsEngine);
  const [echoGhostEngine] = useState(() => new EchoGhostEngine());
  const echoGhostRef = useRef(echoGhostEngine);
  const [balloonPopEngine] = useState(() => new BalloonPopEngine());
  const balloonPopRef = useRef(balloonPopEngine);
  const lightsRef = useRef(new WilliamsLights());
  const playerRef = useRef(new ScorePlayer());
  const pianoClickSynthRef = useRef(new PianoClickSynth());
  const midiNoteOutRef = useRef(new MidiNoteOutput());
  const adapterRef = useRef<MidiAdapter | null>(null);
  const heardRef = useRef(new Set<number>());
  const clickCycleChannelRef = useRef(loadLightProfile().channel);
  const dockRef = useRef<HTMLElement | null>(null);
  const pianoControlsHelpBtnRef = useRef<HTMLButtonElement | null>(null);
  const listenTransportRef = useRef<ListenTransport>("idle");
  const feedbackRef = useRef<FeedbackState | null>(null);
  const listenEventIndexRef = useRef<number | null>(null);
  const pianoControlsEnabledRef = useRef(loadPianoControlsEnabled());
  const soundEnabledRef = useRef(loadSoundEnabled());
  const listenMidiSoundRef = useRef(loadListenMidiSound());
  const controlKeysRef = useRef(new ControlKeyHandler());
  const dispatchControlRef = useRef<(action: ControlAction) => void>(() => {});
  const appModeRef = useRef<AppMode>("practice");
  const scoreRef = useRef<LoadedScore | null>(null);
  const writeScoreRef = useRef<LoadedScore | null>(null);
  const writeNoteSinkRef = useRef<{
    noteOn: (midi: number, timestamp?: number) => void;
    noteOff: (midi: number, timestamp?: number) => void;
  } | null>(null);
  const [writeScore, setWriteScore] = useState<LoadedScore | null>(null);
  const [writeInitialXml, setWriteInitialXml] = useState<string | null>(null);
  const [writeInitialTitle, setWriteInitialTitle] = useState<string | undefined>(undefined);

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
  const [soundEnabled, setSoundEnabled] = useState(loadSoundEnabled);
  const [listenMidiSound, setListenMidiSound] = useState(loadListenMidiSound);
  const [pianoControlsHelpOpen, setPianoControlsHelpOpen] = useState(false);
  const [dockSpacerPx, setDockSpacerPx] = useState(0);
  const [loadingSampleId, setLoadingSampleId] = useState<string | null>(null);
  const [appMode, setAppMode] = useState<AppMode>("practice");
  const [gamesMenuOpen, setGamesMenuOpen] = useState(false);
  const [echoSnap, setEchoSnap] = useState<EchoGhostSnapshot>(() => echoGhostEngine.snapshot());
  const [balloonSnap, setBalloonSnap] = useState<BalloonPopSnapshot>(() =>
    balloonPopEngine.snapshot(),
  );

  const closePianoControlsHelp = useCallback(() => {
    setPianoControlsHelpOpen(false);
    pianoControlsHelpBtnRef.current?.focus();
  }, []);

  const listenActive = listenTransport !== "idle";
  const listenPlaying = listenTransport === "playing";
  const writeActive = appMode === "write";
  const gameActive =
    appMode === "fallingLights" || appMode === "echoGhost" || appMode === "balloonPop";

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    writeScoreRef.current = writeScore;
  }, [writeScore]);

  useEffect(() => {
    appModeRef.current = appMode;
  }, [appMode]);

  useEffect(() => {
    listenTransportRef.current = listenTransport;
  }, [listenTransport]);

  useEffect(() => {
    const falling = fallingLightsRef.current;
    const echo = echoGhostRef.current;
    const balloon = balloonPopRef.current;
    return () => {
      falling.stop();
      echo.stop();
      balloon.stop();
    };
  }, []);

  useEffect(() => echoGhostEngine.subscribe(setEchoSnap), [echoGhostEngine]);
  useEffect(() => balloonPopEngine.subscribe(setBalloonSnap), [balloonPopEngine]);

  useEffect(() => {
    if (!gamesMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest?.(".games-menu")) return;
      setGamesMenuOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [gamesMenuOpen]);

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
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    listenMidiSoundRef.current = listenMidiSound;
  }, [listenMidiSound]);

  useEffect(() => {
    const player = playerRef.current;
    const clickSynth = pianoClickSynthRef.current;
    const midiOut = midiNoteOutRef.current;
    return () => {
      player.stop({ emitEnded: false });
      midiOut.allNotesOff(adapterRef.current);
      clickSynth.dispose();
    };
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
      return a.onMessage((data, timestamp) => {
        const msg = parseMidiMessage(data);
        if (!msg) return;
        if (msg.type === "noteon") {
          if (appModeRef.current === "write") {
            heardRef.current.add(msg.note);
            setHeard(new Set(heardRef.current));
            writeNoteSinkRef.current?.noteOn(msg.note, timestamp);
            return;
          }
          if (pianoControlsEnabledRef.current) {
            const result = controlKeysRef.current.handleNoteOn(msg.note);
            if (result.consumed) {
              if (result.action) dispatchControlRef.current(result.action);
              return;
            }
          }
          heardRef.current.add(msg.note);
          setHeard(new Set(heardRef.current));
          if (appModeRef.current === "fallingLights") {
            fallingLightsRef.current.noteOn(msg.note, timestamp);
            return;
          }
          if (appModeRef.current === "echoGhost") {
            echoGhostRef.current.noteOn(msg.note);
            return;
          }
          if (appModeRef.current === "balloonPop") {
            balloonPopRef.current.noteOn(msg.note, timestamp);
            return;
          }
          if (listenTransportRef.current === "idle") {
            engineRef.current.noteOn(msg.note);
          }
        } else {
          if (appModeRef.current === "write") {
            heardRef.current.delete(msg.note);
            setHeard(new Set(heardRef.current));
            writeNoteSinkRef.current?.noteOff(msg.note, timestamp);
            return;
          }
          if (pianoControlsEnabledRef.current && isReservedControlMidi(msg.note)) {
            return;
          }
          heardRef.current.delete(msg.note);
          setHeard(new Set(heardRef.current));
          if (appModeRef.current === "balloonPop") {
            balloonPopRef.current.noteOff(msg.note);
            return;
          }
          if (appModeRef.current === "fallingLights" || appModeRef.current === "echoGhost") return;
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
    if (listenActive || gameActive) return;
    if (!feedback) return;
    if (feedback.hinted || feedback.expected.size > 0) {
      const profile = lightsRef.current.getProfile();
      if (profile.mode === "noteOn") {
        lightsRef.current.setExpected(feedback.expected);
      }
    }
    if (feedback.done) lightsRef.current.clear();
  }, [feedback, listenActive, gameActive]);

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
    try {
      localStorage.setItem(PIANO_CLICK_SOUND_KEY, soundEnabled ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [soundEnabled]);

  useEffect(() => {
    try {
      localStorage.setItem(LISTEN_MIDI_SOUND_KEY, listenMidiSound ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [listenMidiSound]);

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
    midiNoteOutRef.current.allNotesOff(adapterRef.current);
    adapterRef.current?.disconnect();
    lightsRef.current.clear();
    setConnectedName(null);
  }, []);

  const clearListenHeard = useCallback(() => {
    heardRef.current.clear();
    setHeard(new Set());
    lightsRef.current.clear();
    midiNoteOutRef.current.allNotesOff(adapterRef.current);
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

  const activeListenScore = useCallback((): LoadedScore | null => {
    if (appModeRef.current === "write") return writeScoreRef.current;
    return scoreRef.current;
  }, []);

  const playListenFrom = useCallback(
    async (startEventIndex: number, options?: { maxEvents?: number }) => {
      const listenScore = activeListenScore();
      if (!listenScore) return;
      const maxEvents = options?.maxEvents;
      const muteAudio = listenMidiSoundRef.current;
      lightsRef.current.clear();
      midiNoteOutRef.current.allNotesOff(adapterRef.current);
      heardRef.current.clear();
      setHeard(new Set());
      setListenTransport("playing");
      setListenEventIndex(startEventIndex);

      try {
        await playerRef.current.play(listenScore, {
          bpm: listenBpm,
          hand: "both",
          startEventIndex,
          maxEvents,
          muteAudio,
          onEvent: (eventIndex) => setListenEventIndex(eventIndex),
          onNote: (midi, on, staffIndex) => {
            if (on) heardRef.current.add(midi);
            else heardRef.current.delete(midi);
            setHeard(new Set(heardRef.current));

            if (listenMidiSoundRef.current) {
              if (on) midiNoteOutRef.current.noteOn(adapterRef.current, midi);
              else midiNoteOutRef.current.noteOff(adapterRef.current, midi);
            }

            const profile = lightsRef.current.getProfile();
            if (profile.mode !== "noteOn") return;
            const channel = staffIndex === 0 ? profile.trebleChannel : profile.bassChannel;
            lightsRef.current.lightNote(midi, on, channel);
          },
          onEnded: () => {
            midiNoteOutRef.current.allNotesOff(adapterRef.current);
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
        midiNoteOutRef.current.allNotesOff(adapterRef.current);
        lightsRef.current.clear();
        setMidiError(err instanceof Error ? err.message : String(err));
      }
    },
    [listenBpm, activeListenScore],
  );

  const togglePlayPause = useCallback(() => {
    if (!activeListenScore()) return;
    if (listenTransportRef.current === "playing") {
      pauseListen();
      return;
    }
    if (listenTransportRef.current === "paused" && listenEventIndexRef.current != null) {
      void playListenFrom(listenEventIndexRef.current);
      return;
    }
    const start =
      appModeRef.current === "write" ? 0 : (feedbackRef.current?.eventIndex ?? 0);
    void playListenFrom(start);
  }, [activeListenScore, pauseListen, playListenFrom]);

  const playNextEvents = useCallback(
    (n: number) => {
      if (!activeListenScore()) return;
      let start: number;
      if (listenTransportRef.current === "playing") {
        start =
          listenEventIndexRef.current ??
          (appModeRef.current === "write" ? 0 : (feedbackRef.current?.eventIndex ?? 0));
        playerRef.current.stop({ emitEnded: false });
      } else if (
        listenTransportRef.current === "paused" &&
        listenEventIndexRef.current != null
      ) {
        start = listenEventIndexRef.current;
      } else {
        start = appModeRef.current === "write" ? 0 : (feedbackRef.current?.eventIndex ?? 0);
      }
      void playListenFrom(start, { maxEvents: n });
    },
    [activeListenScore, playListenFrom],
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
      const listenScore = activeListenScore();
      if (!listenScore) return;
      const clamped = Math.min(
        Math.max(0, eventIndex),
        Math.max(0, listenScore.events.length - 1),
      );
      setListenEventIndex(clamped);

      if (listenTransportRef.current === "playing") {
        void playListenFrom(clamped);
        return;
      }
      // idle or paused → park Listen cursor without auto-starting
      playerRef.current.stop({ emitEnded: false });
      setListenTransport("paused");
      lightsRef.current.clear();
      midiNoteOutRef.current.allNotesOff(adapterRef.current);
    },
    [activeListenScore, playListenFrom],
  );

  const onSeekPractice = useCallback((eventIndex: number) => {
    engineRef.current.seek(eventIndex);
  }, []);

  const exitGame = useCallback(() => {
    fallingLightsRef.current.stop();
    echoGhostRef.current.stop();
    balloonPopRef.current.stop();
    setGamesMenuOpen(false);
    setAppMode("practice");
  }, []);

  const enterGame = useCallback(
    (game: GameId) => {
      playerRef.current.stop({ emitEnded: false });
      setListenTransport("idle");
      setListenEventIndex(null);
      clearListenHeard();
      fallingLightsRef.current.stop();
      echoGhostRef.current.stop();
      balloonPopRef.current.stop();
      setGamesMenuOpen(false);
      setWriteScore(null);
      setWriteInitialXml(null);
      setAppMode(game);
    },
    [clearListenHeard],
  );

  const enterWrite = useCallback(
    (opts?: { xml?: string; title?: string }) => {
      playerRef.current.stop({ emitEnded: false });
      setListenTransport("idle");
      setListenEventIndex(null);
      clearListenHeard();
      fallingLightsRef.current.stop();
      echoGhostRef.current.stop();
      balloonPopRef.current.stop();
      setGamesMenuOpen(false);
      setWriteInitialXml(opts?.xml ?? scoreRef.current?.xml ?? null);
      setWriteInitialTitle(opts?.title ?? scoreRef.current?.title);
      setWriteScore(null);
      setAppMode("write");
    },
    [clearListenHeard],
  );

  const exitWrite = useCallback(() => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    clearListenHeard();
    setWriteScore(null);
    setWriteInitialXml(null);
    setAppMode("practice");
  }, [clearListenHeard]);

  const openWriteInPractice = useCallback((loaded: LoadedScore) => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    clearListenHeard();
    setWriteScore(null);
    setWriteInitialXml(null);
    setScore(loaded);
    engineRef.current.load(loaded, hand);
    setAppMode("practice");
  }, [clearListenHeard, hand]);

  const goHome = useCallback(() => {
    fallingLightsRef.current.stop();
    echoGhostRef.current.stop();
    balloonPopRef.current.stop();
    setGamesMenuOpen(false);
    setAppMode("practice");
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    heardRef.current.clear();
    setHeard(new Set());
    lightsRef.current.clear();
    midiNoteOutRef.current.allNotesOff(adapterRef.current);
    engineRef.current.unload();
    setScore(null);
    setWriteScore(null);
    setWriteInitialXml(null);
  }, []);

  const onLoadFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      setMidiError(null);
      playerRef.current.stop({ emitEnded: false });
      setListenTransport("idle");
      setListenEventIndex(null);
      lightsRef.current.clear();
      midiNoteOutRef.current.allNotesOff(adapterRef.current);
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
        const fileName =
          decodeURIComponent(sample.path.split("/").pop() ?? "") ||
          `${sample.id}.musicxml`;
        const lower = fileName.toLowerCase();
        const type = lower.endsWith(".mxl")
          ? "application/vnd.recordare.musicxml"
          : "application/vnd.recordare.musicxml+xml";
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
    if (appMode === "fallingLights") {
      map.set(FALLING_LEFT_MIDI, "expected");
      map.set(FALLING_RIGHT_MIDI, "expected");
      for (const n of heard) {
        if (n === FALLING_LEFT_MIDI || n === FALLING_RIGHT_MIDI) map.set(n, "correct");
        else map.set(n, "heard");
      }
      return map;
    }
    if (appMode === "echoGhost") {
      // Ghost the sounding note while listening only — do not reveal targets during echo.
      if (echoSnap.phase === "listening" && echoSnap.ghostMidi != null) {
        map.set(echoSnap.ghostMidi, "expected");
      }
      for (const n of heard) {
        if (map.get(n) === "expected") map.set(n, "correct");
        else map.set(n, "heard");
      }
      return map;
    }
    if (appMode === "balloonPop") {
      for (const n of balloonSnap.expectedMidis) {
        map.set(n, "expected");
      }
      for (const n of heard) {
        if (map.get(n) === "expected") map.set(n, "correct");
        else map.set(n, "heard");
      }
      return map;
    }
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
  }, [feedback, heard, listenActive, appMode, echoSnap, balloonSnap]);

  const onLightProfile = useCallback((profile: LightProfile) => {
    setLightProfile(profile);
    lightsRef.current.setProfile(profile);
  }, []);

  const onPianoKeyClick = useCallback((midi: number) => {
    if (appModeRef.current === "write") {
      if (soundEnabledRef.current) {
        void pianoClickSynthRef.current.play(midi);
      }
      heardRef.current.add(midi);
      setHeard(new Set(heardRef.current));
      writeNoteSinkRef.current?.noteOn(midi);
      window.setTimeout(() => {
        writeNoteSinkRef.current?.noteOff(midi);
        heardRef.current.delete(midi);
        setHeard(new Set(heardRef.current));
      }, 120);
      return;
    }

    if (pianoControlsEnabledRef.current) {
      const result = controlKeysRef.current.handleNoteOn(midi);
      if (result.consumed) {
        if (result.action) dispatchControlRef.current(result.action);
        return;
      }
    }

    if (soundEnabledRef.current) {
      void pianoClickSynthRef.current.play(midi);
    }

    heardRef.current.add(midi);
    setHeard(new Set(heardRef.current));

    if (appModeRef.current === "fallingLights") {
      fallingLightsRef.current.noteOn(midi);
      window.setTimeout(() => {
        heardRef.current.delete(midi);
        setHeard(new Set(heardRef.current));
      }, 120);
      return;
    }

    if (appModeRef.current === "echoGhost") {
      echoGhostRef.current.noteOn(midi);
      window.setTimeout(() => {
        heardRef.current.delete(midi);
        setHeard(new Set(heardRef.current));
      }, 120);
      return;
    }

    if (appModeRef.current === "balloonPop") {
      balloonPopRef.current.noteOn(midi);
      // Longer hold so multi-tap chords can stack via the engine grace window.
      window.setTimeout(() => {
        balloonPopRef.current.noteOff(midi);
        heardRef.current.delete(midi);
        setHeard(new Set(heardRef.current));
      }, 400);
      return;
    }

    if (listenTransportRef.current === "idle") {
      engineRef.current.noteOn(midi);
    }

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
          {writeActive ? (
            <button
              type="button"
              className="btn game-active"
              onClick={exitWrite}
              title="Leave Write and return to practice"
            >
              Leave Write
            </button>
          ) : gameActive ? (
            <button
              type="button"
              className="btn game-active"
              onClick={exitGame}
              title="Leave game and return to practice"
            >
              Leave game
            </button>
          ) : (
            <div className="games-menu">
              <button
                type="button"
                className="btn"
                onClick={() => setGamesMenuOpen((v) => !v)}
                aria-expanded={gamesMenuOpen}
                aria-haspopup="menu"
                title="Open mini-games"
              >
                Games
              </button>
              {gamesMenuOpen ? (
                <div className="games-menu-panel" role="menu">
                  <button
                    type="button"
                    className="btn"
                    role="menuitem"
                    onClick={() => enterGame("fallingLights")}
                  >
                    Falling Lights
                  </button>
                  <button
                    type="button"
                    className="btn"
                    role="menuitem"
                    onClick={() => enterGame("echoGhost")}
                  >
                    Echo Ghost
                  </button>
                  <button
                    type="button"
                    className="btn"
                    role="menuitem"
                    onClick={() => enterGame("balloonPop")}
                  >
                    Balloon Pop
                  </button>
                </div>
              ) : null}
            </div>
          )}
          <button
            type="button"
            className={`btn${writeActive ? " primary" : ""}`}
            onClick={() => enterWrite()}
            disabled={gameActive}
            title="Write sheet music by playing"
          >
            Write
          </button>
          <button
            type="button"
            className="btn"
            onClick={goHome}
            title="Browse scores"
            disabled={(!score && !writeActive) || gameActive}
          >
            Library
          </button>
          <label className={`btn primary file-btn${gameActive || writeActive ? " disabled" : ""}`}>
            Load score
            <input
              type="file"
              accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
              hidden
              disabled={gameActive || writeActive}
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
        {appMode === "write" ? (
          <WriteWorkspace
            initialXml={writeInitialXml}
            initialTitle={writeInitialTitle}
            listenBpm={listenBpm}
            onListenBpm={setListenBpm}
            listenTransport={listenTransport}
            listenEventIndex={listenEventIndex}
            listenMidiSound={listenMidiSound}
            onToggleListenMidiSound={() =>
              setListenMidiSound((v) => {
                if (v) midiNoteOutRef.current.allNotesOff(adapterRef.current);
                return !v;
              })
            }
            onPlayPause={togglePlayPause}
            onStopListen={stopListen}
            onSeekListen={onSeekListen}
            onLoadedScoreChange={setWriteScore}
            onOpenInPractice={openWriteInPractice}
            onExit={exitWrite}
            noteSinkRef={writeNoteSinkRef}
            feedbackPlaceholder={null}
          />
        ) : appMode === "fallingLights" ? (
          <FallingLightsGame engine={fallingLightsEngine} onExit={exitGame} />
        ) : appMode === "echoGhost" ? (
          <EchoGhostGame engine={echoGhostEngine} onExit={exitGame} />
        ) : appMode === "balloonPop" ? (
          <BalloonPopGame
            engine={balloonPopEngine}
            onExit={exitGame}
            soundEnabled={soundEnabled}
          />
        ) : score ? (
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
                className={`btn score-listen-sound-btn ${listenMidiSound ? "active" : ""}`}
                aria-pressed={listenMidiSound}
                aria-label={
                  listenMidiSound
                    ? "Piano MIDI sound on — Listen plays on your piano"
                    : "Piano MIDI sound off"
                }
                title={
                  listenMidiSound
                    ? "Piano sound on: Listen sends MIDI so your piano plays (Web Audio muted)"
                    : "Piano sound off: Listen uses computer speakers only"
                }
                onClick={() =>
                  setListenMidiSound((v) => {
                    if (v) midiNoteOutRef.current.allNotesOff(adapterRef.current);
                    return !v;
                  })
                }
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
              <button
                type="button"
                className="btn"
                onClick={() => engineRef.current.reset()}
                disabled={listenActive}
                title="Restart practice from the beginning"
              >
                Restart
              </button>
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
              Or{" "}
              <button type="button" className="linkish" onClick={() => enterWrite()}>
                write your own sheet music
              </button>
              , or try a mini-game:{" "}
              <button type="button" className="linkish" onClick={() => enterGame("fallingLights")}>
                Falling Lights
              </button>{" "}
              (timing),{" "}
              <button type="button" className="linkish" onClick={() => enterGame("echoGhost")}>
                Echo Ghost
              </button>{" "}
              (ear echo), or{" "}
              <button type="button" className="linkish" onClick={() => enterGame("balloonPop")}>
                Balloon Pop
              </button>{" "}
              (pop note/chord balloons).
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
              <button type="button" className="btn large" onClick={() => enterWrite()}>
                Write
              </button>
              <button type="button" className="btn large" onClick={() => enterGame("fallingLights")}>
                Falling Lights
              </button>
              <button type="button" className="btn large" onClick={() => enterGame("echoGhost")}>
                Echo Ghost
              </button>
              <button type="button" className="btn large" onClick={() => enterGame("balloonPop")}>
                Balloon Pop
              </button>
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
          <p className="status">
            {appMode === "write"
              ? "Write — play the piano or on-screen keys to enter notes. Control keys are off here."
              : appMode === "fallingLights"
                ? "Falling Lights — play C3 (left) and C5 (right) on the beat."
                : appMode === "echoGhost"
                  ? "Echo Ghost — listen, then replay the pitches in order (C4–B4)."
                  : appMode === "balloonPop"
                    ? "Balloon Pop — play the note or chord on each balloon before it floats away."
                    : (feedback?.statusText ?? "Connect MIDI and load a score.")}
          </p>
          <div className="dock-buttons">
            <button
              type="button"
              className="btn"
              onClick={() => engineRef.current.showHint()}
              disabled={!score || feedback?.done || listenActive || gameActive || writeActive}
            >
              Show hint
            </button>
            <label className="field inline">
              <span>Hands</span>
              <select
                value={hand}
                onChange={(e) => onHandChange(e.target.value as Hand)}
                disabled={listenActive || gameActive || writeActive}
              >
                <option value="both">Both</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
            <label
              className="field inline"
              title="Play tones when clicking the on-screen piano"
            >
              <span>Sound</span>
              <input
                type="checkbox"
                checked={soundEnabled}
                onChange={(e) => setSoundEnabled(e.target.checked)}
              />
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
          controlsEnabled={pianoControlsEnabled && !writeActive}
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
