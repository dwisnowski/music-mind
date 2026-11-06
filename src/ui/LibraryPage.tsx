import { LibraryBrowser } from "./LibraryBrowser";
import type { SampleScore } from "../score/samples";

export interface LibraryPageProps {
  onLoadFile: (file: File | null) => void;
  onLoadSample: (sample: SampleScore) => void;
  loadingSampleId: string | null;
  onEnterWrite: () => void;
  onEnterFreePractice: () => void;
  onBrowseGames: () => void;
}

export function LibraryPage({
  onLoadFile,
  onLoadSample,
  loadingSampleId,
  onEnterWrite,
  onEnterFreePractice,
  onBrowseGames,
}: LibraryPageProps) {
  return (
    <div className="library-page">
      <h2>Load sheet music to practice</h2>
      <p>
        Drop a MusicXML or compressed <code>.mxl</code> file, pick a score from the library,
        connect your Williams piano over MIDI, and play — the cursor waits for the correct notes.
        Or{" "}
        <button type="button" className="linkish" onClick={onEnterFreePractice}>
          free practice
        </button>{" "}
        with lit scales and riffs,{" "}
        <button type="button" className="linkish" onClick={onEnterWrite}>
          write your own sheet music
        </button>
        , or try a{" "}
        <button type="button" className="linkish" onClick={onBrowseGames}>
          mini-game
        </button>
        .
      </p>
      <div className="panel-row wrap library-actions">
        <label className="btn primary file-btn large">
          Load score
          <input
            type="file"
            accept=".musicxml,.xml,.mxl,application/vnd.recordare.musicxml+xml,application/xml,text/xml"
            hidden
            onChange={(e) => onLoadFile(e.target.files?.[0] ?? null)}
          />
        </label>
      </div>
      <LibraryBrowser onSelect={onLoadSample} loadingId={loadingSampleId} />
    </div>
  );
}
