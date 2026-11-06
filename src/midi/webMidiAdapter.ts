import type { MidiAdapter, MidiDeviceInfo, MidiMessageHandler } from "./types";
import { matchOutput, preferInput } from "./pianoFamily";

export function createWebMidiAdapter(): MidiAdapter {
  let access: MIDIAccess | null = null;
  let input: MIDIInput | null = null;
  let output: MIDIOutput | null = null;
  const handlers = new Set<MidiMessageHandler>();

  const onMidimessage = (event: MIDIMessageEvent) => {
    if (!event.data) return;
    const data = new Uint8Array(event.data);
    const ts = event.timeStamp;
    for (const handler of handlers) handler(data, ts);
  };

  return {
    kind: "webmidi",

    isSupported() {
      return typeof navigator !== "undefined" && typeof navigator.requestMIDIAccess === "function";
    },

    async listInputs() {
      if (!access) {
        access = await navigator.requestMIDIAccess({ sysex: true });
      }
      const devices: MidiDeviceInfo[] = [];
      for (const port of access.inputs.values()) {
        devices.push({
          id: port.id,
          name: port.name ?? "MIDI Input",
          manufacturer: port.manufacturer ?? undefined,
        });
      }
      return devices;
    },

    async listOutputs() {
      if (!access) {
        access = await navigator.requestMIDIAccess({ sysex: true });
      }
      const devices: MidiDeviceInfo[] = [];
      for (const port of access.outputs.values()) {
        devices.push({
          id: port.id,
          name: port.name ?? "MIDI Output",
          manufacturer: port.manufacturer ?? undefined,
        });
      }
      return devices;
    },

    async connect(inputId?: string, outputId?: string) {
      if (!access) {
        access = await navigator.requestMIDIAccess({ sysex: true });
      }

      if (input) {
        input.removeEventListener("midimessage", onMidimessage);
        input = null;
      }

      const inputs = [...access.inputs.values()];
      const inputInfos: MidiDeviceInfo[] = inputs.map((p) => ({
        id: p.id,
        name: p.name ?? "MIDI Input",
        manufacturer: p.manufacturer ?? undefined,
      }));
      const preferred = preferInput(inputInfos);
      const chosenInfo =
        (inputId ? inputInfos.find((p) => p.id === inputId) : null) ?? preferred ?? null;
      const chosenInput = chosenInfo ? inputs.find((p) => p.id === chosenInfo.id) ?? null : null;

      if (!chosenInput || !chosenInfo) {
        throw new Error("No MIDI input found. Pair your piano, then try again.");
      }

      input = chosenInput;
      input.addEventListener("midimessage", onMidimessage);

      const outputs = [...access.outputs.values()];
      const outputInfos: MidiDeviceInfo[] = outputs.map((p) => ({
        id: p.id,
        name: p.name ?? "MIDI Output",
        manufacturer: p.manufacturer ?? undefined,
      }));
      const matched = matchOutput(chosenInfo, outputInfos);
      const chosenOutputInfo =
        (outputId ? outputInfos.find((p) => p.id === outputId) : null) ?? matched ?? null;
      output = chosenOutputInfo
        ? (outputs.find((p) => p.id === chosenOutputInfo.id) ?? null)
        : null;

      access.onstatechange = () => {
        /* keep connection; UI can refresh device lists */
      };
    },

    disconnect() {
      if (input) {
        input.removeEventListener("midimessage", onMidimessage);
        input = null;
      }
      output = null;
    },

    send(data: number[] | Uint8Array) {
      if (!output) return;
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
      output.send(bytes);
    },

    onMessage(handler: MidiMessageHandler) {
      handlers.add(handler);
      return () => {
        handlers.delete(handler);
      };
    },
  };
}
