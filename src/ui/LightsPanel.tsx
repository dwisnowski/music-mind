import type { LightProfile } from "../lights/williamsLights";

interface LightsPanelProps {
  profile: LightProfile;
  onChange: (profile: LightProfile) => void;
  onProbeChannel: () => void;
  onProbeAll: () => void;
  /** False for Roland / generic — physical LED probe is Williams-only. */
  deviceSupportsLights: boolean;
}

function channelInput(
  label: string,
  value: number,
  onChannel: (channel: number) => void,
  disabled: boolean,
) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        min={1}
        max={16}
        value={value + 1}
        disabled={disabled}
        onChange={(e) => onChannel(Math.min(15, Math.max(0, Number(e.target.value) - 1)))}
      />
    </label>
  );
}

export function LightsPanel({
  profile,
  onChange,
  onProbeChannel,
  onProbeAll,
  deviceSupportsLights,
}: LightsPanelProps) {
  const disabled = !deviceSupportsLights;

  return (
    <div className="panel lights-panel">
      <div className="panel-row">
        <strong>Key lights</strong>
        <span className="muted">Williams LED probe</span>
      </div>
      {disabled ? (
        <p className="muted small">
          Physical key lights are Williams-only on the connected piano. The on-screen keyboard still
          shows practice hints. Connect a Williams / Symphony endpoint to probe LED channels.
        </p>
      ) : (
        <p className="muted small">
          The Symphony Grand II does not document LED SysEx. Try Note On on a channel (use Local Off
          if notes also sound). Persist the working channel once LEDs respond. Listen uses treble and
          bass channels as two colors — probe/sweep to learn which channel is which color.
        </p>
      )}
      <label className="field">
        <span>Mode</span>
        <select
          value={profile.mode}
          disabled={disabled}
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
      disabled)}
      {channelInput("Treble channel (1–16)", profile.trebleChannel, (trebleChannel) =>
        onChange({ ...profile, trebleChannel }),
      disabled)}
      {channelInput("Bass channel (1–16)", profile.bassChannel, (bassChannel) =>
        onChange({ ...profile, bassChannel }),
      disabled)}
      <div className="panel-row wrap">
        <button type="button" className="btn" onClick={onProbeChannel} disabled={disabled}>
          Pulse C4 on channel
        </button>
        <button type="button" className="btn ghost" onClick={onProbeAll} disabled={disabled}>
          Sweep channels 1–16
        </button>
      </div>
    </div>
  );
}
