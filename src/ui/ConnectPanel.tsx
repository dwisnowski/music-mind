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
              pair in Audio MIDI Setup (Mac) or the app’s Bluetooth sheet (iPad), then refresh.
            </p>
          )}
        </>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
