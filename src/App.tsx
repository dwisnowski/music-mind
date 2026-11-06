import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBestMidiAdapter,
  detectPianoFamily,
  matchOutput,
  parseMidiMessage,
  pianoFamilyAriaLabel,
  pianoFamilyLabel,
  preferInput,
  supportsKeyLights,
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
import { PianoControlsHelp } from "./ui/PianoControlsHelp";
import { HomePage } from "./ui/HomePage";
import { LibraryPage } from "./ui/LibraryPage";
import { GamesPage, type GameId } from "./ui/GamesPage";
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
import {
  FreePracticeEngine,
  FreePracticeWorkspace,
  chordKeyOf,
  type FreePracticePlayMode,
  type FreePracticeSnapshot,
  type TheoryTab,
} from "./freePractice";
import {
  buildScaleMidis,
  chordMidis,
  diatonicChords,
  getGenre,
  getRiff,
  resolveRiffMidis,
  scalePitchClasses,
  type GenreId,
  type ScaleId,
} from "./theory";

const DOCK_PIN_KEY = "music-mind-dock-pinned";
const PIANO_CONTROLS_KEY = "mm.pianoControls";
const PIANO_CLICK_SOUND_KEY = "mm.pianoClickSound";
const LISTEN_MIDI_SOUND_KEY = "mm.listenMidiSound";

type AppMode =
  | "home"
  | "library"
  | "games"
  | "practice"
  | "write"
  | "freePractice"
  | "fallingLights"
  | "echoGhost"
  | "balloonPop";

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
  const [freePracticeEngine] = useState(() => new FreePracticeEngine());
  const freePracticeRef = useRef(freePracticeEngine);
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
  const appModeRef = useRef<AppMode>("home");
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
  const [selectedInputId, setSelectedInputId] = useState<string | null>(null);
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
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
  const [appMode, setAppMode] = useState<AppMode>("home");
  const [echoSnap, setEchoSnap] = useState<EchoGhostSnapshot>(() => echoGhostEngine.snapshot());
  const [balloonSnap, setBalloonSnap] = useState<BalloonPopSnapshot>(() =>
    balloonPopEngine.snapshot(),
  );
  const [fpSnap, setFpSnap] = useState<FreePracticeSnapshot>(() => freePracticeEngine.snapshot());
  const [fpGenreId, setFpGenreId] = useState<GenreId>("blues");
  const [fpRootPc, setFpRootPc] = useState(0);
  const [fpScaleId, setFpScaleId] = useState<ScaleId>("blues");
  const [fpPlayMode, setFpPlayMode] = useState<FreePracticePlayMode>("free");
  const [fpChordKey, setFpChordKey] = useState<string | null>(null);
  const [fpRiffId, setFpRiffId] = useState<string | null>(null);
  const [fpTheoryTab, setFpTheoryTab] = useState<TheoryTab>("chords");

  const closePianoControlsHelp = useCallback(() => {
    setPianoControlsHelpOpen(false);
    pianoControlsHelpBtnRef.current?.focus();
  }, []);

  const listenActive = listenTransport !== "idle";
  const listenPlaying = listenTransport === "playing";
  const homeActive = appMode === "home";
  const libraryActive = appMode === "library";
  const gamesHubActive = appMode === "games";
  const writeActive = appMode === "write";
  const freePracticeActive = appMode === "freePractice";
  const gameActive =
    appMode === "fallingLights" || appMode === "echoGhost" || appMode === "balloonPop";
  const gamesSegmentActive = gamesHubActive || gameActive;

  const returnAfterMode = useCallback(() => {
    setAppMode(scoreRef.current ? "practice" : "home");
  }, []);

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
    const freePractice = freePracticeRef.current;
    return () => {
      falling.stop();
      echo.stop();
      balloon.stop();
      freePractice.stop();
    };
  }, []);

  useEffect(() => echoGhostEngine.subscribe(setEchoSnap), [echoGhostEngine]);
  useEffect(() => balloonPopEngine.subscribe(setBalloonSnap), [balloonPopEngine]);
  useEffect(() => freePracticeEngine.subscribe(setFpSnap), [freePracticeEngine]);

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
          if (appModeRef.current === "freePractice") {
            heardRef.current.add(msg.note);
            setHeard(new Set(heardRef.current));
            freePracticeRef.current.noteOn(msg.note);
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
          if (appModeRef.current === "freePractice") {
            heardRef.current.delete(msg.note);
            setHeard(new Set(heardRef.current));
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
    if (listenActive || gameActive || freePracticeActive) return;
    if (!feedback) return;
    if (feedback.hinted || feedback.expected.size > 0) {
      const profile = lightsRef.current.getProfile();
      if (profile.mode === "noteOn") {
        lightsRef.current.setExpected(feedback.expected);
      }
    }
    if (feedback.done) lightsRef.current.clear();
  }, [feedback, listenActive, gameActive, freePracticeActive]);

  const fpScaleMidis = useMemo(() => {
    if (!freePracticeActive) return [] as number[];
    return buildScaleMidis(fpRootPc, fpScaleId);
  }, [freePracticeActive, fpRootPc, fpScaleId]);

  const fpChordToneMidis = useMemo(() => {
    if (!freePracticeActive || fpChordKey == null) return [] as number[];
    const chord = diatonicChords(fpRootPc, fpScaleId).find((c) => chordKeyOf(c) === fpChordKey);
    return chord ? chordMidis(chord) : [];
  }, [freePracticeActive, fpChordKey, fpRootPc, fpScaleId]);

  const fpLedExpected = useMemo(() => {
    if (!freePracticeActive) return new Set<number>();
    if (fpPlayMode === "guided") {
      return fpSnap.expectedMidi != null ? new Set([fpSnap.expectedMidi]) : new Set<number>();
    }
    if (fpChordToneMidis.length > 0) return new Set(fpChordToneMidis);
    return new Set(fpScaleMidis);
  }, [
    freePracticeActive,
    fpPlayMode,
    fpSnap.expectedMidi,
    fpChordToneMidis,
    fpScaleMidis,
  ]);

  useEffect(() => {
    if (!freePracticeActive || listenActive) return;
    const profile = lightsRef.current.getProfile();
    if (profile.mode !== "noteOn") return;
    lightsRef.current.setExpected(fpLedExpected);
  }, [freePracticeActive, listenActive, fpLedExpected]);

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
      const ins = await adapterRef.current.listInputs();
      const outs = await adapterRef.current.listOutputs();
      const chosenInput =
        (inputId ? ins.find((d) => d.id === inputId) : null) ?? preferInput(ins) ?? null;
      const chosenOutput =
        (outputId ? outs.find((d) => d.id === outputId) : null) ??
        matchOutput(chosenInput ?? undefined, outs) ??
        null;
      await adapterRef.current.connect(chosenInput?.id, chosenOutput?.id);
      const name = chosenInput?.name ?? "MIDI device";
      setConnectedName(name);
      setSelectedInputId(chosenInput?.id ?? null);
      setSelectedOutputId(chosenOutput?.id ?? null);
      setInputs(ins);
      setOutputs(outs);
      const family = detectPianoFamily(name);
      lightsRef.current.setDeviceLightsEnabled(supportsKeyLights(family));
      lightsRef.current.setAdapter(adapterRef.current);
    } catch (err) {
      setMidiError(err instanceof Error ? err.message : String(err));
      setConnectedName(null);
      setSelectedInputId(null);
      setSelectedOutputId(null);
      lightsRef.current.setDeviceLightsEnabled(true);
    }
  }, []);

  const disconnect = useCallback(() => {
    midiNoteOutRef.current.allNotesOff(adapterRef.current);
    adapterRef.current?.disconnect();
    lightsRef.current.clear();
    lightsRef.current.setDeviceLightsEnabled(true);
    setConnectedName(null);
    setSelectedInputId(null);
    setSelectedOutputId(null);
  }, []);

  const openSettings = useCallback(() => {
    void refreshDevices().then(() => setSettingsOpen(true));
  }, [refreshDevices]);

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
    freePracticeRef.current.stop();
    setAppMode("games");
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
      freePracticeRef.current.stop();
      setWriteScore(null);
      setWriteInitialXml(null);
      setAppMode(game);
    },
    [clearListenHeard],
  );

  const goGames = useCallback(() => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    clearListenHeard();
    fallingLightsRef.current.stop();
    echoGhostRef.current.stop();
    balloonPopRef.current.stop();
    freePracticeRef.current.stop();
    setWriteScore(null);
    setWriteInitialXml(null);
    setAppMode("games");
  }, [clearListenHeard]);

  const enterWrite = useCallback(
    (opts?: { xml?: string; title?: string }) => {
      playerRef.current.stop({ emitEnded: false });
      setListenTransport("idle");
      setListenEventIndex(null);
      clearListenHeard();
      fallingLightsRef.current.stop();
      echoGhostRef.current.stop();
      balloonPopRef.current.stop();
      freePracticeRef.current.stop();
      setWriteInitialXml(opts?.xml ?? scoreRef.current?.xml ?? null);
      setWriteInitialTitle(opts?.title ?? scoreRef.current?.title);
      setWriteScore(null);
      setAppMode("write");
    },
    [clearListenHeard],
  );

  const enterFreePractice = useCallback(() => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    clearListenHeard();
    fallingLightsRef.current.stop();
    echoGhostRef.current.stop();
    balloonPopRef.current.stop();
    freePracticeRef.current.clear();
    setWriteScore(null);
    setWriteInitialXml(null);
    setAppMode("freePractice");
  }, [clearListenHeard]);

  const exitFreePractice = useCallback(() => {
    freePracticeRef.current.stop();
    lightsRef.current.clear();
    heardRef.current.clear();
    setHeard(new Set());
    returnAfterMode();
  }, [returnAfterMode]);

  const onFpGenre = useCallback((id: GenreId) => {
    const g = getGenre(id);
    setFpGenreId(id);
    setFpScaleId(g.defaultScale);
    setFpRiffId(null);
    setFpChordKey(null);
    freePracticeRef.current.clear();
  }, []);

  const onFpRiffId = useCallback(
    (id: string | null) => {
      setFpRiffId(id);
      if (!id) {
        freePracticeRef.current.clear();
        return;
      }
      const riff = getRiff(id);
      if (!riff) return;
      setFpScaleId(riff.scaleId);
      if (fpPlayMode === "guided") {
        freePracticeRef.current.loadPhrase(resolveRiffMidis(riff, fpRootPc, riff.scaleId));
      }
    },
    [fpPlayMode, fpRootPc],
  );

  const onFpPlayMode = useCallback(
    (mode: FreePracticePlayMode) => {
      setFpPlayMode(mode);
      if (mode === "free") {
        freePracticeRef.current.clear();
        return;
      }
      if (fpRiffId) {
        const riff = getRiff(fpRiffId);
        if (riff) {
          freePracticeRef.current.loadPhrase(resolveRiffMidis(riff, fpRootPc, fpScaleId));
        }
      }
    },
    [fpRiffId, fpRootPc, fpScaleId],
  );

  const onFpDemo = useCallback(() => {
    if (!fpRiffId) return;
    const riff = getRiff(fpRiffId);
    if (!riff) return;
    freePracticeRef.current.startDemo(resolveRiffMidis(riff, fpRootPc, fpScaleId));
  }, [fpRiffId, fpRootPc, fpScaleId]);

  const onFpRestartGuided = useCallback(() => {
    freePracticeRef.current.restart();
  }, []);

  // Keep guided phrase in sync when root/scale change with a riff selected.
  useEffect(() => {
    if (!freePracticeActive || fpPlayMode !== "guided" || !fpRiffId) return;
    const riff = getRiff(fpRiffId);
    if (!riff) return;
    freePracticeRef.current.loadPhrase(resolveRiffMidis(riff, fpRootPc, fpScaleId));
  }, [freePracticeActive, fpPlayMode, fpRiffId, fpRootPc, fpScaleId]);

  const exitWrite = useCallback(() => {
    playerRef.current.stop({ emitEnded: false });
    setListenTransport("idle");
    setListenEventIndex(null);
    clearListenHeard();
    setWriteScore(null);
    setWriteInitialXml(null);
    returnAfterMode();
  }, [clearListenHeard, returnAfterMode]);

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

  const clearToSurface = useCallback((mode: "home" | "library") => {
    fallingLightsRef.current.stop();
    echoGhostRef.current.stop();
    balloonPopRef.current.stop();
    freePracticeRef.current.stop();
    setAppMode(mode);
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

  const goHome = useCallback(() => {
    clearToSurface("home");
  }, [clearToSurface]);

  const goLibrary = useCallback(() => {
    clearToSurface("library");
  }, [clearToSurface]);

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
      setAppMode("practice");
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
    if (appMode === "freePractice") {
      if (fpPlayMode === "free") {
        const chordSet = new Set(fpChordToneMidis);
        for (const n of fpScaleMidis) {
          map.set(n, chordSet.has(n) ? "chord" : "scale");
        }
      } else {
        if (fpSnap.expectedMidi != null) map.set(fpSnap.expectedMidi, "expected");
        if (fpSnap.wrongFlash != null) map.set(fpSnap.wrongFlash, "wrong");
      }
      const scalePcs = new Set(scalePitchClasses(fpRootPc, fpScaleId));
      for (const n of heard) {
        if (map.get(n) === "expected" || map.get(n) === "chord" || map.get(n) === "scale") {
          map.set(n, "correct");
        } else if (scalePcs.has(n % 12)) {
          map.set(n, "correct");
        } else {
          map.set(n, "heard");
        }
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
  }, [
    feedback,
    heard,
    listenActive,
    appMode,
    echoSnap,
    balloonSnap,
    fpPlayMode,
    fpScaleMidis,
    fpChordToneMidis,
    fpSnap,
    fpRootPc,
    fpScaleId,
  ]);

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

    if (appModeRef.current === "freePractice") {
      if (soundEnabledRef.current) {
        void pianoClickSynthRef.current.play(midi);
      }
      heardRef.current.add(midi);
      setHeard(new Set(heardRef.current));
      freePracticeRef.current.noteOn(midi);
      window.setTimeout(() => {
        heardRef.current.delete(midi);
        setHeard(new Set(heardRef.current));
      }, 220);
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

  const pianoConnected = connectedName != null;
  const pianoFamily = detectPianoFamily(connectedName);
  const deviceSupportsLights = !pianoConnected || supportsKeyLights(pianoFamily);
  const midiStatusLabel = pianoFamilyLabel(pianoFamily, pianoConnected);
  const midiStatusAria = pianoFamilyAriaLabel(pianoFamily, pianoConnected);

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
            title="Music Mind home"
            aria-label="Music Mind — home"
          >
            Music Mind
          </button>
        </h1>
        <button
          type="button"
          className={`topbar-midi pill${pianoConnected ? " ok" : ""}`}
          onClick={() => {
            if (settingsOpen) {
              setSettingsOpen(false);
              return;
            }
            openSettings();
          }}
          title={pianoConnected ? connectedName ?? midiStatusLabel : "Open MIDI settings"}
          aria-label={midiStatusAria}
          aria-pressed={settingsOpen}
        >
          {midiStatusLabel}
        </button>
        <div className="topbar-actions">
          <div className="mode-group" role="group" aria-label="Modes">
            <button
              type="button"
              className={`btn mode-seg${libraryActive ? " primary" : ""}`}
              onClick={() => {
                if (!libraryActive) goLibrary();
              }}
              title="Browse scores"
            >
              Library
            </button>
            <button
              type="button"
              className={`btn mode-seg${gamesSegmentActive ? " primary" : ""}`}
              onClick={() => {
                if (!gamesHubActive) goGames();
              }}
              title="Browse mini-games"
            >
              Games
            </button>
            <button
              type="button"
              className={`btn mode-seg${freePracticeActive ? " primary" : ""}`}
              onClick={() => {
                if (freePracticeActive) exitFreePractice();
                else enterFreePractice();
              }}
              title={
                freePracticeActive
                  ? "Leave Free Practice"
                  : "Free Practice — scales, riffs, and theory helpers"
              }
            >
              Free Practice
            </button>
            <button
              type="button"
              className={`btn mode-seg${writeActive ? " primary" : ""}`}
              onClick={() => {
                if (writeActive) exitWrite();
                else enterWrite();
              }}
              title={writeActive ? "Leave Write" : "Write sheet music by playing"}
            >
              Write
            </button>
          </div>
          <button
            type="button"
            className="btn ghost icon-btn"
            onClick={() => {
              if (settingsOpen) {
                setSettingsOpen(false);
                return;
              }
              openSettings();
            }}
            title="Settings"
            aria-label="Settings"
            aria-pressed={settingsOpen}
          >
            <svg
              className="gear-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        </div>
      </header>

      {settingsOpen && (
        <aside className="settings-drawer">
          <ConnectPanel
            adapter={adapter}
            connectedName={connectedName}
            selectedInputId={selectedInputId}
            selectedOutputId={selectedOutputId}
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
            deviceSupportsLights={deviceSupportsLights}
            onChange={onLightProfile}
            onProbeChannel={() => lightsRef.current.pulseProbe()}
            onProbeAll={() => lightsRef.current.probeAllChannels()}
          />
        </aside>
      )}

      <main className={`stage${homeActive ? " stage-home" : ""}`}>
        {homeActive ? (
          <HomePage
            onBrowseLibrary={goLibrary}
            onEnterFreePractice={() => enterFreePractice()}
            onEnterWrite={() => enterWrite()}
            onBrowseGames={goGames}
            onConnect={openSettings}
          />
        ) : libraryActive ? (
          <LibraryPage
            onLoadFile={(file) => void onLoadFile(file)}
            onLoadSample={(sample) => void onLoadSample(sample)}
            loadingSampleId={loadingSampleId}
            onEnterWrite={() => enterWrite()}
            onEnterFreePractice={() => enterFreePractice()}
            onBrowseGames={goGames}
          />
        ) : gamesHubActive ? (
          <GamesPage onEnterGame={enterGame} />
        ) : appMode === "write" ? (
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
        ) : appMode === "freePractice" ? (
          <FreePracticeWorkspace
            genreId={fpGenreId}
            rootPc={fpRootPc}
            scaleId={fpScaleId}
            playMode={fpPlayMode}
            chordKey={fpChordKey}
            riffId={fpRiffId}
            theoryTab={fpTheoryTab}
            heldMidis={heard}
            guided={fpSnap}
            onGenre={onFpGenre}
            onRoot={setFpRootPc}
            onScale={setFpScaleId}
            onPlayMode={onFpPlayMode}
            onChordKey={setFpChordKey}
            onRiffId={onFpRiffId}
            onTheoryTab={setFpTheoryTab}
            onDemo={onFpDemo}
            onRestartGuided={onFpRestartGuided}
            onExit={exitFreePractice}
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
          <LibraryPage
            onLoadFile={(file) => void onLoadFile(file)}
            onLoadSample={(sample) => void onLoadSample(sample)}
            loadingSampleId={loadingSampleId}
            onEnterWrite={() => enterWrite()}
            onEnterFreePractice={() => enterFreePractice()}
            onBrowseGames={goGames}
          />
        )}
      </main>

      {!homeActive ? (
      <section
        ref={dockRef}
        className={`dock${dockPinned ? " dock-pinned" : ""}`}
      >
        <div className="dock-controls">
          <p className="status">
            {appMode === "write"
              ? "Write — play the piano or on-screen keys to enter notes. Control keys are off here."
              : appMode === "freePractice"
                ? fpPlayMode === "guided"
                  ? "Free Practice (Guided) — play the lit next note; Demo walks the riff for you."
                  : "Free Practice — soft lights are scale tones; stronger lights are chord tones."
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
              disabled={
                !score ||
                feedback?.done ||
                listenActive ||
                gameActive ||
                writeActive ||
                freePracticeActive
              }
            >
              Show hint
            </button>
            <label className="field inline">
              <span>Hands</span>
              <select
                value={hand}
                onChange={(e) => onHandChange(e.target.value as Hand)}
                disabled={listenActive || gameActive || writeActive || freePracticeActive}
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
          controlsEnabled={pianoControlsEnabled && !writeActive && !freePracticeActive}
        />
      </section>
      ) : null}

      <PianoControlsHelp open={pianoControlsHelpOpen} onClose={closePianoControlsHelp} />

      <footer className="wiz-footer">
        A <a href="https://www.wildideazone.com/">Wild Idea Zone</a> project ·{" "}
        <a href="https://www.wildideazone.com/projects/music-mind">About this build</a> ·{" "}
        <a href="https://github.com/dwisnowski/music-mind">GitHub</a> ·{" "}
        <a href="https://www.wildideazone.com/projects">More projects</a>
      </footer>
      {!homeActive && dockPinned ? (
        <div className="dock-spacer" style={{ height: dockSpacerPx }} aria-hidden />
      ) : null}
    </div>
  );
}
