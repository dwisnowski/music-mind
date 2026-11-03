# Music Mind iOS (Capacitor)

## Build for your iPad

1. `npm run build && npx cap sync ios`
2. `npx cap open ios`
3. In Xcode, select your Team under Signing & Capabilities
4. Run on a connected iPad, or Archive → Distribute → TestFlight

The CoreMIDI plugin (`plugins/core-midi`) exposes Bluetooth MIDI pairing via `CABTMIDICentralViewController` and bridges note messages into the web app.

Stock Safari cannot use MIDI; this native shell is the supported iPad path.
