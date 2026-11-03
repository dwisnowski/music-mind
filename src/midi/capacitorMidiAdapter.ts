import { Capacitor, registerPlugin } from "@capacitor/core";
import type { MidiAdapter, MidiDeviceInfo, MidiMessageHandler } from "./types";

interface CoreMidiPlugin {
  isAvailable(): Promise<{ available: boolean }>;
  listInputs(): Promise<{ devices: MidiDeviceInfo[] }>;
  listOutputs(): Promise<{ devices: MidiDeviceInfo[] }>;
  connect(options: { inputId?: string; outputId?: string }): Promise<void>;
  disconnect(): Promise<void>;
  send(options: { data: number[] }): Promise<void>;
  openBluetoothPicker(): Promise<void>;
  addListener(
    eventName: "midimessage",
    listener: (event: { data: number[]; timestamp: number }) => void,
  ): Promise<{ remove: () => void }>;
}

const CoreMidi = registerPlugin<CoreMidiPlugin>("CoreMidi");

export function createCapacitorMidiAdapter(): MidiAdapter {
  const handlers = new Set<MidiMessageHandler>();
  let listenerHandle: { remove: () => void } | null = null;

  return {
    kind: "capacitor",

    isSupported() {
      return Capacitor.isNativePlatform();
    },

    async listInputs() {
      const result = await CoreMidi.listInputs();
      return result.devices ?? [];
    },

    async listOutputs() {
      const result = await CoreMidi.listOutputs();
      return result.devices ?? [];
    },

    async connect(inputId?: string, outputId?: string) {
      if (listenerHandle) {
        listenerHandle.remove();
        listenerHandle = null;
      }
      await CoreMidi.connect({ inputId, outputId });
      listenerHandle = await CoreMidi.addListener("midimessage", (event) => {
        const data = new Uint8Array(event.data);
        for (const handler of handlers) handler(data, event.timestamp);
      });
    },

    disconnect() {
      void CoreMidi.disconnect();
      if (listenerHandle) {
        listenerHandle.remove();
        listenerHandle = null;
      }
    },

    send(data: number[] | Uint8Array) {
      const bytes = data instanceof Uint8Array ? [...data] : data;
      void CoreMidi.send({ data: bytes });
    },

    onMessage(handler: MidiMessageHandler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },

    async openBluetoothPicker() {
      await CoreMidi.openBluetoothPicker();
    },
  };
}

export async function capacitorMidiAvailable(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  try {
    const result = await CoreMidi.isAvailable();
    return result.available;
  } catch {
    return false;
  }
}
