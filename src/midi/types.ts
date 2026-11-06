export type MidiMessageHandler = (data: Uint8Array, timestamp: number) => void;

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer?: string;
}

export interface MidiAdapter {
  readonly kind: "webmidi" | "capacitor" | "none";
  isSupported(): boolean;
  listInputs(): Promise<MidiDeviceInfo[]>;
  listOutputs(): Promise<MidiDeviceInfo[]>;
  connect(inputId?: string, outputId?: string): Promise<void>;
  disconnect(): void;
  send(data: number[] | Uint8Array): void;
  onMessage(handler: MidiMessageHandler): () => void;
  openBluetoothPicker?(): Promise<void>;
}

export interface ParsedMidiNote {
  type: "noteon" | "noteoff";
  note: number;
  velocity: number;
  channel: number;
}

export interface ParsedMidiCc {
  type: "cc";
  controller: number;
  value: number;
  channel: number;
}

export type ParsedMidiMessage = ParsedMidiNote | ParsedMidiCc;

/** Sustain, sostenuto, soft pedals. */
export const PEDAL_CONTROLLERS = new Set([64, 66, 67]);

export function isPedalController(controller: number): boolean {
  return PEDAL_CONTROLLERS.has(controller);
}

export function parseMidiMessage(data: Uint8Array): ParsedMidiMessage | null {
  if (data.length < 2) return null;
  const status = data[0]!;
  const command = status & 0xf0;
  const channel = status & 0x0f;
  const data1 = data[1]!;
  const data2 = data.length > 2 ? data[2]! : 0;

  if (command === 0x90) {
    if (data2 > 0) {
      return { type: "noteon", note: data1, velocity: data2, channel };
    }
    return { type: "noteoff", note: data1, velocity: 0, channel };
  }
  if (command === 0x80) {
    return { type: "noteoff", note: data1, velocity: data2, channel };
  }
  if (command === 0xb0) {
    return { type: "cc", controller: data1, value: data2, channel };
  }
  return null;
}

/** MIDI note 21 = A0, 108 = C8 for 88-key piano */
export const PIANO_LOW = 21;
export const PIANO_HIGH = 108;

export function midiToName(note: number): string {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = names[note % 12]!;
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}
