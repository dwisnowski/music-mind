import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createBestMidiAdapter,
  parseMidiMessage,
  type MidiAdapter,
  type MidiDeviceInfo,
} from "./midi";
import { readScoreFile } from "./score/loadMusicXml";
import { parseMusicXmlTimeline } from "./score/parseMusicXmlTimeline";
import { SAMPLE_SCORES, type SampleScore } from "./score/samples";
import type { Hand, LoadedScore } from "./score/types";
import { FeedbackEngine, type FeedbackState } from "./practice/feedbackEngine";
import { WilliamsLights, loadLightProfile, type LightProfile } from "./lights/williamsLights";
import { ScoreView } from "./ui/ScoreView";
import { PianoKeyboard, type KeyVisualState } from "./ui/PianoKeyboard";
import { ConnectPanel } from "./ui/ConnectPanel";
import { LightsPanel } from "./ui/LightsPanel";

export default function App() {
  const engineRef = useRef(new FeedbackEngine());
  const lightsRef = useRef(new WilliamsLights());
  const adapterRef = useRef<MidiAdapter | null>(null);
  const heardRef = useRef(new Set<number>());

  const [adapter, setAdapter] = useState<MidiAdapter | null>(null);
  const [inputs, setInputs] = useState<MidiDeviceInfo[]>([]);
  const [outputs, setOutputs] = useState<MidiDeviceInfo[]>([]);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [midiError, setMidiError] = useState<string | null>(null);
  const [score, setScore] = useState<LoadedScore | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const [hand, setHand] = useState<Hand>("both");
  const [heard, setHeard] = useState<Set<number>>(new Set());
  const [lightProfile, setLightProfile] = useState<LightProfile>(() => loadLightProfile());
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          heardRef.current.add(msg.note);
          setHeard(new Set(heardRef.current));
          engineRef.current.noteOn(msg.note);
        } else {
          heardRef.current.delete(msg.note);
          setHeard(new Set(heardRef.current));
          engineRef.current.noteOff(msg.note);
        }
      });
    })();
    return () => {
      cancelled = true;
      adapterRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!feedback) return;
    if (feedback.hinted || feedback.expected.size > 0) {
      // Light expected keys when hinting; always sync when mode on
      const profile = lightsRef.current.getProfile();
      if (profile.mode === "noteOn" && (feedback.hinted || true)) {
        lightsRef.current.setExpected(feedback.hinted ? feedback.expected : feedback.expected);
      }
    }
    if (feedback.done) lightsRef.current.clear();
  }, [feedback]);

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

  const onLoadFile = useCallback(async (file: File | null) => {
    if (!file) return;
    try {
      setMidiError(null);
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
      const res = await fetch(sample.path);
      if (!res.ok) {
        setMidiError(`Could not load sample “${sample.title}”.`);
        return;
      }
      const buffer = await res.arrayBuffer();
      const fileName = sample.path.split("/").pop() ?? `${sample.id}.musicxml`;
      const type = fileName.endsWith(".mxl")
        ? "application/vnd.recordare.musicxml"
        : "application/xml";
      await onLoadFile(new File([buffer], fileName, { type }));
    },
    [onLoadFile],
  );

  const onHandChange = useCallback((next: Hand) => {
    setHand(next);
    engineRef.current.setHand(next);
  }, []);

  const keyStates = useMemo(() => {
    const map = new Map<number, KeyVisualState>();
    if (feedback) {
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
  }, [feedback, heard]);

  const onLightProfile = useCallback((profile: LightProfile) => {
    setLightProfile(profile);
    lightsRef.current.setProfile(profile);
  }, []);

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
        <h1 className="brand">Music Mind</h1>
        <div className="topbar-actions">
          <label className="field inline sample-picker">
            <span className="sr-only">Built-in scores</span>
            <select
              defaultValue=""
              onChange={(e) => {
                const sample = SAMPLE_SCORES.find((s) => s.id === e.target.value);
                e.target.value = "";
                if (sample) void onLoadSample(sample);
              }}
            >
              <option value="" disabled>
                Samples…
              </option>
              {SAMPLE_SCORES.map((sample) => (
                <option key={sample.id} value={sample.id}>
                  {sample.title} — {sample.composer}
                </option>
              ))}
            </select>
          </label>
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
          <ScoreView xml={score.xml} feedback={feedback} />
        ) : (
          <div className="empty-score">
            <h2>Load sheet music to practice</h2>
            <p>
              Drop a MusicXML or compressed <code>.mxl</code> file, connect your Williams piano over
              MIDI, and play — the cursor waits for the correct notes.
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
            <ul className="sample-list">
              {SAMPLE_SCORES.map((sample) => (
                <li key={sample.id}>
                  <button type="button" className="btn large" onClick={() => void onLoadSample(sample)}>
                    <span className="sample-title">{sample.title}</span>
                    <span className="sample-composer">{sample.composer}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>

      <section className="dock">
        <div className="dock-controls">
          <p className="status">{feedback?.statusText ?? "Connect MIDI and load a score."}</p>
          <div className="dock-buttons">
            <button type="button" className="btn" onClick={() => engineRef.current.reset()} disabled={!score}>
              Restart
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => engineRef.current.showHint()}
              disabled={!score || feedback?.done}
            >
              Show hint
            </button>
            <label className="field inline">
              <span>Hands</span>
              <select value={hand} onChange={(e) => onHandChange(e.target.value as Hand)}>
                <option value="both">Both</option>
                <option value="right">Right</option>
                <option value="left">Left</option>
              </select>
            </label>
          </div>
        </div>
        <PianoKeyboard
          states={keyStates}
          onKeyClick={(midi) => {
            // Allow clicking keys to simulate MIDI when no hardware
            engineRef.current.noteOn(midi);
            heardRef.current.add(midi);
            setHeard(new Set(heardRef.current));
            window.setTimeout(() => {
              heardRef.current.delete(midi);
              setHeard(new Set(heardRef.current));
              engineRef.current.noteOff(midi);
            }, 120);
          }}
        />
      </section>

      <footer className="wiz-footer">
        A <a href="https://www.wildideazone.com/">Wild Idea Zone</a> project ·{" "}
        <a href="https://www.wildideazone.com/projects/music-mind">About this build</a> ·{" "}
        <a href="https://www.wildideazone.com/projects">More projects</a>
      </footer>
    </div>
  );
}
