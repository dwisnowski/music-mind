import type { LightProfile } from "../lights/williamsLights";

interface LightsPanelProps {
  profile: LightProfile;
  onChange: (profile: LightProfile) => void;
  onProbeChannel: () => void;
  onProbeAll: () => void;
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
        if notes also sound). Persist the working channel once LEDs respond.
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
      <label className="field">
        <span>Channel (1–16)</span>
        <input
          type="number"
          min={1}
          max={16}
          value={profile.channel + 1}
          onChange={(e) =>
            onChange({ ...profile, channel: Math.min(15, Math.max(0, Number(e.target.value) - 1)) })
          }
        />
      </label>
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
