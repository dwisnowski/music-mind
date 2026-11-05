import type { LightProfile } from "../lights/williamsLights";

interface LightsPanelProps {
  profile: LightProfile;
  onChange: (profile: LightProfile) => void;
  onProbeChannel: () => void;
  onProbeAll: () => void;
}

function channelInput(
  label: string,
  value: number,
  onChannel: (channel: number) => void,
) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={16}
        value={value + 1}
        onChange={(e) => onChannel(Math.min(15, Math.max(0, Number(e.target.value) - 1)))}
      />
    </label>
  );
}

export function LightsPanel({ profile, onChange, onProbeChannel, onProbeAll }: LightsPanelProps) {
  return (
    <div className="panel lights-panel">
      <div className="panel-row">
        <strong>Key lights</strong>
        <span className="muted">Williams LED probe</span>
      </div>
      <p className="muted small">
        The Symphony Grand II does not document LED SysEx. Try Note On on a channel (use Local Off
        if notes also sound). Persist the working channel once LEDs respond. Listen uses treble and
        bass channels as two colors — probe/sweep to learn which channel is which color.
      </p>
      <label className="field">
        <span>Mode</span>
        <select
          value={profile.mode}
          onChange={(e) =>
            onChange({ ...profile, mode: e.target.value as LightProfile["mode"] })
          }
        >
          <option value="off">Off (on-screen only)</option>
          <option value="noteOn">Note On → piano</option>
        </select>
      </label>
      {channelInput("Practice channel (1–16)", profile.channel, (channel) =>
        onChange({ ...profile, channel }),
      )}
      {channelInput("Treble channel (1–16)", profile.trebleChannel, (trebleChannel) =>
        onChange({ ...profile, trebleChannel }),
      )}
      {channelInput("Bass channel (1–16)", profile.bassChannel, (bassChannel) =>
        onChange({ ...profile, bassChannel }),
      )}
      <div className="panel-row wrap">
        <button type="button" className="btn" onClick={onProbeChannel}>
          Pulse C4 on channel
        </button>
        <button type="button" className="btn ghost" onClick={onProbeAll}>
          Sweep channels 1–16
        </button>
      </div>
    </div>
  );
}
