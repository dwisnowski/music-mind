import { useEffect, useMemo, useState } from "react";
import { fetchMuseTrainerLibrary } from "../score/museTrainerLibrary";
import { SAMPLE_SCORES, type SampleScore } from "../score/samples";

interface LibraryBrowserProps {
  onSelect: (sample: SampleScore) => void;
  loadingId?: string | null;
}

export function LibraryBrowser({ onSelect, loadingId }: LibraryBrowserProps) {
  const [remote, setRemote] = useState<SampleScore[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchMuseTrainerLibrary()
      .then((scores) => {
        if (!cancelled) setRemote(scores);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    if (!remote) return [];
    const q = query.trim().toLowerCase();
    if (!q) return remote;
    return remote.filter(
      (s) => s.title.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    );
  }, [remote, query]);

  return (
    <div className="library-browser">
      <div className="library-section">
        <h3 className="library-heading">Quick start</h3>
        <ul className="sample-list">
          {SAMPLE_SCORES.map((sample) => (
            <li key={sample.id}>
              <button
                type="button"
                className="btn large"
                disabled={loadingId === sample.id}
                onClick={() => onSelect(sample)}
              >
                <span className="sample-title">{sample.title}</span>
                <span className="sample-composer">{sample.composer}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="library-section">
        <h3 className="library-heading">MuseTrainer library</h3>
        <p className="library-credit">
          Public-domain MusicXML from{" "}
          <a
            href="https://musetrainer.github.io/library/"
            target="_blank"
            rel="noreferrer"
          >
            MuseTrainer
          </a>
          .
        </p>
        <label className="library-search">
          <span className="sr-only">Search library</span>
          <input
            type="search"
            placeholder="Search scores…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!remote}
          />
        </label>
        {error ? <p className="library-status error">{error}</p> : null}
        {!error && !remote ? <p className="library-status">Loading catalog…</p> : null}
        {remote ? (
          <ul className="sample-list library-scroll">
            {filtered.length === 0 ? (
              <li className="library-status">No scores match “{query.trim()}”.</li>
            ) : (
              filtered.map((sample) => (
                <li key={sample.id}>
                  <button
                    type="button"
                    className="btn large"
                    disabled={loadingId === sample.id}
                    onClick={() => onSelect(sample)}
                  >
                    <span className="sample-title">{sample.title}</span>
                    <span className="sample-composer">
                      {loadingId === sample.id ? "Loading…" : sample.composer}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
