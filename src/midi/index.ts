import { Capacitor } from "@capacitor/core";
import { createCapacitorMidiAdapter, capacitorMidiAvailable } from "./capacitorMidiAdapter";
import { createWebMidiAdapter } from "./webMidiAdapter";
import type { MidiAdapter } from "./types";

export * from "./types";
export { createWebMidiAdapter } from "./webMidiAdapter";
export { createCapacitorMidiAdapter } from "./capacitorMidiAdapter";
export {
  detectPianoFamily,
  supportsKeyLights,
  pianoFamilyLabel,
  pianoFamilyAriaLabel,
  preferInput,
  matchOutput,
  type PianoFamily,
} from "./pianoFamily";

export async function createBestMidiAdapter(): Promise<MidiAdapter> {
  if (Capacitor.isNativePlatform() && (await capacitorMidiAvailable())) {
    return createCapacitorMidiAdapter();
  }

  const web = createWebMidiAdapter();
  if (web.isSupported()) {
    return web;
  }

  return {
    kind: "none",
    isSupported: () => false,
    listInputs: async () => [],
    listOutputs: async () => [],
    connect: async () => {
      throw new Error(
        "This browser cannot talk to MIDI devices. On iPad, use the Music Mind app or MIDIWeb Browser.",
      );
    },
    disconnect: () => undefined,
    send: () => undefined,
    onMessage: () => () => undefined,
  };
}

export function isLikelyIosBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
