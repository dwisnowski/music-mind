import type { MidiDeviceInfo } from "./types";

export type PianoFamily = "williams" | "roland" | "generic";

const WILLIAMS_RE = /williams|symphony/i;
const ROLAND_RE = /roland|fp[-\s]?60x/i;
const GENERIC_KEYBOARD_RE = /piano|keyboard/i;

export function detectPianoFamily(name: string | null | undefined): PianoFamily {
  const n = name ?? "";
  if (WILLIAMS_RE.test(n)) return "williams";
  if (ROLAND_RE.test(n)) return "roland";
  return "generic";
}

export function supportsKeyLights(family: PianoFamily): boolean {
  return family === "williams";
}

/** Short label for the top-bar indicator. */
export function pianoFamilyLabel(family: PianoFamily, connected: boolean): string {
  if (!connected) return "No piano";
  switch (family) {
    case "williams":
      return "Williams";
    case "roland":
      return "Roland FP-60X";
    default:
      return "MIDI piano";
  }
}

export function pianoFamilyAriaLabel(family: PianoFamily, connected: boolean): string {
  if (!connected) return "MIDI disconnected";
  switch (family) {
    case "williams":
      return "Connected to Williams piano";
    case "roland":
      return "Connected to Roland FP-60X";
    default:
      return "Connected to MIDI piano";
  }
}

/** Prefer Williams, then Roland, then generic piano/keyboard names, else first. */
export function preferInput(devices: MidiDeviceInfo[]): MidiDeviceInfo | undefined {
  return (
    devices.find((d) => detectPianoFamily(d.name) === "williams") ??
    devices.find((d) => detectPianoFamily(d.name) === "roland") ??
    devices.find((d) => GENERIC_KEYBOARD_RE.test(d.name)) ??
    devices[0]
  );
}

/** Match output by same display name as input; else prefer same family; else first. */
export function matchOutput(
  input: MidiDeviceInfo | undefined,
  outputs: MidiDeviceInfo[],
): MidiDeviceInfo | undefined {
  if (!input) return outputs[0];
  const byName = outputs.find((o) => o.name === input.name);
  if (byName) return byName;
  const family = detectPianoFamily(input.name);
  if (family !== "generic") {
    const byFamily = outputs.find((o) => detectPianoFamily(o.name) === family);
    if (byFamily) return byFamily;
  }
  return (
    outputs.find((o) => detectPianoFamily(o.name) === "williams") ??
    outputs.find((o) => GENERIC_KEYBOARD_RE.test(o.name)) ??
    outputs[0]
  );
}
