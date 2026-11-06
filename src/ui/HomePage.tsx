import { MusicMindParticles } from "./MusicMindParticles";
import type { GameId } from "./LibraryPage";

export interface HomePageProps {
  onBrowseLibrary: () => void;
  onEnterFreePractice: () => void;
  onEnterWrite: () => void;
  onEnterGame: (game: GameId) => void;
  onConnect: () => void;
}

export function HomePage({
  onBrowseLibrary,
  onEnterFreePractice,
  onEnterWrite,
  onEnterGame,
  onConnect,
}: HomePageProps) {
  return (
    <div className="home-page">
      <section className="home-hero" aria-label="Music Mind introduction">
        <MusicMindParticles />
        <p className="home-lede">
          Sheet music that waits for you — load MusicXML, connect your Williams piano over MIDI,
          and play Feedback until every note lands.
        </p>
        <div className="home-cta">
          <button type="button" className="btn primary large" onClick={onBrowseLibrary}>
            Browse library
          </button>
          <div className="home-secondary">
            <button type="button" className="linkish" onClick={onEnterFreePractice}>
              Free Practice
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="linkish" onClick={onEnterWrite}>
              Write
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="linkish" onClick={() => onEnterGame("fallingLights")}>
              Games
            </button>
            <span aria-hidden="true">·</span>
            <button type="button" className="linkish" onClick={onConnect}>
              Connect
            </button>
          </div>
        </div>
      </section>

      <section className="home-need">
        <h2>What you need</h2>
        <p>
          Chrome or Edge on desktop for Web MIDI, or the Capacitor iPad build for CoreMIDI. Drop in
          MusicXML or <code>.mxl</code>, pair your piano, and practice — lights and the on-screen
          keyboard show the way.
        </p>
      </section>
    </div>
  );
}
