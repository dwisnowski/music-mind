import { useEffect, useMemo, useState } from "react";
import { fetchArabesqueLibrary } from "../score/arabesqueLibrary";
import { fetchMuseTrainerLibrary } from "../score/museTrainerLibrary";
import { PRIVATE_SAMPLE_SCORES } from "../score/privateSamples";
import { useRecentScores, type RecentScore } from "../score/recentScores";
import { SAMPLE_SCORES, type SampleScore } from "../score/samples";

interface LibraryBrowserProps {
  onSelect: (sample: SampleScore) => void;
  loadingId?: string | null;
  /** Shown under Personal library when a gated score needs Access sign-in. */
  privateAccessHint?: string | null;
  onPrivateSignIn?: () => void;
}

type RemoteSource = "MuseTrainer" | "Arabesque";
type CatalogView = "remote" | "personal" | "recent";
type SourceFilter = "all" | RemoteSource;
type SortKey = "title-asc" | "title-desc" | "composer" | "played";

interface RemoteScore extends SampleScore {
  source: RemoteSource;
}

const QUICK_START_KEY = "music-mind:quick-start-open";

function readQuickStartOpen(): boolean {
  try {
    return localStorage.getItem(QUICK_START_KEY) !== "0";
  } catch {
    return true;
  }
}

function remoteSubtitle(sample: RemoteScore): string {
  if (sample.source === "MuseTrainer") return "MuseTrainer";
  return `${sample.composer} · Arabesque`;
}

function matchesQuery(sample: SampleScore, query: string, extra = ""): boolean {
  if (!query) return true;
  return (
    sample.title.toLowerCase().includes(query) ||
    sample.composer.toLowerCase().includes(query) ||
    sample.id.toLowerCase().includes(query) ||
    extra.toLowerCase().includes(query)
  );
}

function sortScores<T extends SampleScore>(
  items: T[],
  sort: SortKey,
  playedAt?: (sample: T) => number,
): T[] {
  const copy = [...items];
  copy.sort((a, b) => {
    if (sort === "played") return (playedAt?.(b) ?? 0) - (playedAt?.(a) ?? 0);
    if (sort === "composer") {
      const byComposer = a.composer.localeCompare(b.composer, undefined, { sensitivity: "base" });
      if (byComposer !== 0) return byComposer;
    }
    const byTitle = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
    return sort === "title-desc" ? -byTitle : byTitle;
  });
  return copy;
}

function ScoreGrid({
  scores,
  loadingId,
  onSelect,
  subtitle,
}: {
  scores: SampleScore[];
  loadingId?: string | null;
  onSelect: (sample: SampleScore) => void;
  subtitle: (sample: SampleScore) => string;
}) {
  return (
    <ul className="library-grid">
      {scores.map((sample) => (
        <li key={sample.id}>
          <button
            type="button"
            className="btn large"
            disabled={loadingId === sample.id}
            onClick={() => onSelect(sample)}
          >
            <span className="sample-title">{sample.title}</span>
            <span className="sample-composer">
              {loadingId === sample.id ? "Loading…" : subtitle(sample)}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function LibraryBrowser({
  onSelect,
  loadingId,
  privateAccessHint,
  onPrivateSignIn,
}: LibraryBrowserProps) {
  const [museTrainer, setMuseTrainer] = useState<SampleScore[] | null>(null);
  const [museTrainerError, setMuseTrainerError] = useState<string | null>(null);
  const [arabesque, setArabesque] = useState<SampleScore[] | null>(null);
  const [arabesqueError, setArabesqueError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<CatalogView>("remote");
  const [source, setSource] = useState<SourceFilter>("all");
  const [sort, setSort] = useState<SortKey>("title-asc");
  const [quickStartOpen, setQuickStartOpen] = useState(readQuickStartOpen);
  const recent = useRecentScores();

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
    return merged;
  }, [museTrainer, arabesque]);

  const q = query.trim().toLowerCase();

  const filteredRemote = useMemo(() => {
    if (!remote) return [];
    const matched = remote.filter(
      (score) =>
        (source === "all" || score.source === source) &&
        matchesQuery(score, q, score.source),
    );
    return sortScores(matched, sort === "played" ? "title-asc" : sort);
  }, [remote, q, source, sort]);

  const filteredPersonal = useMemo(() => {
    const matched = PRIVATE_SAMPLE_SCORES.filter((score) => matchesQuery(score, q));
    return sortScores(matched, sort === "played" ? "title-asc" : sort);
  }, [q, sort]);

  const filteredRecent = useMemo(() => {
    const matched = recent.filter((score) => matchesQuery(score, q));
    return sortScores(matched, sort, (score: RecentScore) => score.playedAt);
  }, [recent, q, sort]);

  const loading = !museTrainer && !arabesque && !museTrainerError && !arabesqueError;
  const statusErrors = [museTrainerError, arabesqueError].filter(Boolean) as string[];

  const chooseCatalog = (next: CatalogView) => {
    setCatalog(next);
    setSort((current) => {
      if (next === "recent") return "played";
      return current === "played" ? "title-asc" : current;
    });
  };

  const toggleQuickStart = () => {
    setQuickStartOpen((open) => {
      const next = !open;
      try {
        localStorage.setItem(QUICK_START_KEY, next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  const emptyQuery = q ? (
    <p className="library-status">No scores match “{query.trim()}”.</p>
  ) : null;

  return (
    <div className="library-browser">
      <div className="library-section">
        <button
          type="button"
          className="library-disclosure library-heading"
          aria-expanded={quickStartOpen}
          aria-controls="library-quick-start"
          onClick={toggleQuickStart}
        >
          Quick start
        </button>
        {quickStartOpen ? (
          <ul id="library-quick-start" className="sample-list library-quick-list">
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
        ) : null}
      </div>

      <div className="library-section">
        <div className="mode-group library-catalog-toggle" role="tablist" aria-label="Score catalog">
          <button
            type="button"
            role="tab"
            aria-selected={catalog === "remote"}
            className={`btn mode-seg${catalog === "remote" ? " primary" : ""}`}
            onClick={() => chooseCatalog("remote")}
          >
            Remote library
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={catalog === "personal"}
            className={`btn mode-seg${catalog === "personal" ? " primary" : ""}`}
            onClick={() => chooseCatalog("personal")}
          >
            Personal library
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={catalog === "recent"}
            className={`btn mode-seg${catalog === "recent" ? " primary" : ""}`}
            onClick={() => chooseCatalog("recent")}
          >
            Recent
          </button>
        </div>

        <div className="library-toolbar">
          <label className="library-search">
            <span className="sr-only">Search scores</span>
            <input
              type="search"
              placeholder="Search scores…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={catalog === "remote" && !remote}
            />
          </label>
          {catalog === "remote" ? (
            <label className="library-filter">
              <span className="sr-only">Source</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value as SourceFilter)}
                aria-label="Source"
              >
                <option value="all">All sources</option>
                <option value="MuseTrainer">MuseTrainer</option>
                <option value="Arabesque">Arabesque</option>
              </select>
            </label>
          ) : null}
          <label className="library-filter">
            <span className="sr-only">Sort</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort"
            >
              {catalog === "recent" ? (
                <option value="played">Recently opened</option>
              ) : null}
              <option value="title-asc">Title A–Z</option>
              <option value="title-desc">Title Z–A</option>
              <option value="composer">Composer A–Z</option>
            </select>
          </label>
        </div>

        {catalog === "personal" ? (
          <div role="tabpanel">
            <p className="library-credit">
              Owner-only scores behind Cloudflare Access (not publicly redistributed).
            </p>
            {privateAccessHint ? (
              <p className="library-status error">
                {privateAccessHint}{" "}
                {onPrivateSignIn ? (
                  <button type="button" className="btn linkish" onClick={onPrivateSignIn}>
                    Sign in
                  </button>
                ) : null}
              </p>
            ) : null}
            {filteredPersonal.length === 0 ? (
              emptyQuery
            ) : (
              <ScoreGrid
                scores={filteredPersonal}
                loadingId={loadingId}
                onSelect={onSelect}
                subtitle={(sample) => sample.composer}
              />
            )}
          </div>
        ) : null}

        {catalog === "recent" ? (
          <div role="tabpanel">
            <p className="library-credit">Scores you have opened in Practice or Write.</p>
            {filteredRecent.length === 0 ? (
              <p className="library-status">
                {q ? `No scores match “${query.trim()}”.` : "Scores you open show up here."}
              </p>
            ) : (
              <ScoreGrid
                scores={filteredRecent}
                loadingId={loadingId}
                onSelect={onSelect}
                subtitle={(sample) => sample.composer}
              />
            )}
          </div>
        ) : null}

        {catalog === "remote" ? (
          <div role="tabpanel">
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
            {statusErrors.length > 0 ? (
              <p className="library-status error">{statusErrors.join(" ")}</p>
            ) : null}
            {loading ? <p className="library-status">Loading catalog…</p> : null}
            {remote && filteredRemote.length === 0 ? (
              <p className="library-status">
                {q ? `No scores match “${query.trim()}”.` : "No scores in this source."}
              </p>
            ) : null}
            {remote && filteredRemote.length > 0 ? (
              <ScoreGrid
                scores={filteredRemote}
                loadingId={loadingId}
                onSelect={onSelect}
                subtitle={(sample) => remoteSubtitle(sample as RemoteScore)}
              />
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
