import type { MidiAdapter, MidiDeviceInfo } from "../midi/types";
import { isLikelyIosBrowser } from "../midi";

interface ConnectPanelProps {
  adapter: MidiAdapter | null;
  connectedName: string | null;
  inputs: MidiDeviceInfo[];
  outputs: MidiDeviceInfo[];
  error: string | null;
  onConnect: (inputId?: string, outputId?: string) => void;
  onDisconnect: () => void;
  onRefresh: () => void;
  onOpenBluetooth?: () => void;
}

export function ConnectPanel({
  adapter,
  connectedName,
  inputs,
  outputs,
  error,
  onConnect,
  onDisconnect,
  onRefresh,
  onOpenBluetooth,
}: ConnectPanelProps) {
  const unsupported = adapter?.kind === "none";
  const ios = isLikelyIosBrowser();

  return (
    <div className="panel connect-panel">
      <div className="panel-row">
        <strong>MIDI</strong>
        {connectedName ? (
          <span className="pill ok">Connected · {connectedName}</span>
        ) : (
          <span className="pill">Not connected</span>
        )}
      </div>

      {unsupported && (
        <div className="callout">
          {ios ? (
            <>
              <p>
                Stock Safari and Chrome on iPad cannot use MIDI. Open Music Mind in the{" "}
                <strong>Music Mind app</strong> (TestFlight), or in{" "}
                <a href="https://midiweb.app/" target="_blank" rel="noreferrer">
                  MIDIWeb Browser
                </a>
                .
              </p>
            </>
          ) : (
            <p>This browser does not support Web MIDI. Use Chrome or Edge on desktop.</p>
          )}
        </div>
      )}

      {!unsupported && (
        <>
          <div className="panel-row wrap">
            <button type="button" className="btn" onClick={onRefresh}>
              Refresh devices
            </button>
            {adapter?.openBluetoothPicker && (
              <button type="button" className="btn" onClick={onOpenBluetooth}>
                Bluetooth MIDI…
              </button>
            )}
            {connectedName ? (
              <button type="button" className="btn ghost" onClick={onDisconnect}>
                Disconnect
              </button>
            ) : (
              <button
                type="button"
                className="btn primary"
                onClick={() => onConnect(inputs[0]?.id, outputs[0]?.id)}
                disabled={inputs.length === 0}
              >
                Connect
              </button>
            )}
          </div>

          {inputs.length > 0 && (
            <label className="field">
              <span>Input</span>
              <select
                defaultValue={inputs[0]?.id}
                onChange={(e) => onConnect(e.target.value, outputs[0]?.id)}
              >
                {inputs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {inputs.length === 0 && (
            <p className="muted">
              No MIDI inputs yet. Enable Bluetooth MIDI on the piano (Function → Main → Bluetooth),
              then follow the connection notes below and refresh.
            </p>
          )}

          <details className="connect-notes">
            <summary>Connection notes</summary>
            {ios ? (
              <ol>
                <li>Turn on the piano and enable Bluetooth MIDI (Function → Main → Bluetooth).</li>
                <li>
                  Tap <strong>Bluetooth MIDI…</strong> above (or use the system Bluetooth MIDI sheet) and
                  connect the piano.
                </li>
                <li>Return here and tap <strong>Refresh devices</strong>, then <strong>Connect</strong>.</li>
              </ol>
            ) : (
              <>
                <p className="muted small">
                  Bluetooth MIDI on Mac is configured in Audio MIDI Setup — not System Settings → Bluetooth.
                </p>
                <ol>
                  <li>
                    Power on the keyboard or adapter and put it in pairing / discoverable mode. Enable
                    Bluetooth on the Mac (System Settings).
                  </li>
                  <li>
                    Open <strong>Audio MIDI Setup</strong> (Spotlight: ⌘Space, type the name; or Finder →
                    Applications → Utilities).
                  </li>
                  <li>
                    If devices are not visible, choose <strong>Window → Show MIDI Studio</strong>.
                  </li>
                  <li>
                    Click the Bluetooth icon in MIDI Studio (or <strong>Window → Show Bluetooth
                    Configuration</strong>).
                  </li>
                  <li>
                    Select your device in the list and click <strong>Connect</strong>, then return here and
                    tap <strong>Refresh devices</strong>.
                  </li>
                </ol>
              </>
            )}
          </details>
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
