import { useEffect, useMemo, useState } from "react";
import { fetchArabesqueLibrary } from "../score/arabesqueLibrary";
import { fetchMuseTrainerLibrary } from "../score/museTrainerLibrary";
import { SAMPLE_SCORES, type SampleScore } from "../score/samples";

interface LibraryBrowserProps {
  onSelect: (sample: SampleScore) => void;
  loadingId?: string | null;
}

type RemoteSource = "MuseTrainer" | "Arabesque";

interface RemoteScore extends SampleScore {
  source: RemoteSource;
}

function remoteSubtitle(sample: RemoteScore): string {
  if (sample.source === "MuseTrainer") return "MuseTrainer";
  return `${sample.composer} · Arabesque`;
}

export function LibraryBrowser({ onSelect, loadingId }: LibraryBrowserProps) {
  const [museTrainer, setMuseTrainer] = useState<SampleScore[] | null>(null);
  const [museTrainerError, setMuseTrainerError] = useState<string | null>(null);
  const [arabesque, setArabesque] = useState<SampleScore[] | null>(null);
  const [arabesqueError, setArabesqueError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    void fetchMuseTrainerLibrary()
      .then((scores) => {
        if (!cancelled) setMuseTrainer(scores);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setMuseTrainerError(err instanceof Error ? err.message : String(err));
        }
      });
    void fetchArabesqueLibrary()
      .then((scores) => {
        if (!cancelled) setArabesque(scores);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setArabesqueError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const remote: RemoteScore[] | null = useMemo(() => {
    if (!museTrainer && !arabesque) return null;
    const merged: RemoteScore[] = [];
    for (const score of museTrainer ?? []) {
      merged.push({ ...score, source: "MuseTrainer" });
    }
    for (const score of arabesque ?? []) {
      merged.push({ ...score, source: "Arabesque" });
    }
    merged.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" }));
    return merged;
  }, [museTrainer, arabesque]);

  const filtered = useMemo(() => {
    if (!remote) return [];
    const q = query.trim().toLowerCase();
    if (!q) return remote;
    return remote.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.composer.toLowerCase().includes(q) ||
        s.source.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q),
    );
  }, [remote, query]);

  const loading = !museTrainer && !arabesque && !museTrainerError && !arabesqueError;
  const statusErrors = [museTrainerError, arabesqueError].filter(Boolean) as string[];

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
        <h3 className="library-heading">Remote library</h3>
        <p className="library-credit">
          Public-domain MusicXML from{" "}
          <a
            href="https://musetrainer.github.io/library/"
            target="_blank"
            rel="noreferrer"
          >
            MuseTrainer
          </a>{" "}
          and{" "}
          <a href="https://arabesque.app/" target="_blank" rel="noreferrer">
            Arabesque
          </a>
          .
        </p>
        <label className="library-search">
          <span className="sr-only">Search remote library</span>
          <input
            type="search"
            placeholder="Search scores…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={!remote}
          />
        </label>
        {statusErrors.length > 0 ? (
          <p className="library-status error">{statusErrors.join(" ")}</p>
        ) : null}
        {loading ? <p className="library-status">Loading catalog…</p> : null}
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
                      {loadingId === sample.id ? "Loading…" : remoteSubtitle(sample)}
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
