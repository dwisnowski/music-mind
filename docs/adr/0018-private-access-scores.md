# ADR 0018: Private Access-gated personal scores

## Status

Accepted. Extends [ADR 0001](0001-mvp-practice-architecture.md) and [ADR 0005](0005-musetrainer-remote-library.md).

## Context

The owner has personal piano arrangements (Musicnotes page captures and derived MusicXML) that should load in Music Mind for practice, but must not be redistributed. The GitHub repo and the SPA at `musicmind.wildideazone.com` are public. Bundling those scores under Quick start or committing them to git would expose them. HyperSync already uses Cloudflare Access email OTP plus an app-side email allowlist; Music Mind needs the same *identity* model scoped to score bytes only, not the whole app.

## Decision

- **Personal score files live in the private GitHub repo** [`dwisnowski/music-mind-scores`](https://github.com/dwisnowski/music-mind-scores) (`scores/`, `sources/`). **Production serves them from Workers KV** (`PRIVATE_SCORES`) behind a Worker gate (R2 was preferred but not enabled on this account). The public Music Mind repo stores only catalog metadata in `src/score/privateSamples.ts`. Never commit score bytes or page PNGs here.
- **Path-scoped Cloudflare Access** protects `musicmind.wildideazone.com/samples/private/*` (and related private API paths) with email OTP. Policy allowlists the owner email (default `dwisnows@gmail.com`, overridable via `OWNER_EMAILS`).
- **Worker defense-in-depth:** before reading a KV key, the Worker verifies the Access JWT (header or `CF_Authorization` cookie) and checks the email against `OWNER_EMAILS`. Production fails closed if Access secrets are unset. Responses use `Cache-Control: private, no-store`.
- **UI:** Library shows a **Personal library** section. Fetches use `credentials: "include"`. Unauthenticated users get a sign-in prompt; Quick start and remote catalogs stay public and unchanged.
- **Assets routing:** `run_worker_first` covers private score and `/api/*` paths so static asset serving cannot bypass the gate.
- Educational fingerings on public-domain personal conversions are authored in MusicXML; OSMD renders them. Practice timeline parsing remains pitch-only.

## Consequences

- Private score upload is an owner-machine step (`wrangler kv key put --binding PRIVATE_SCORES …`); CI/public clones cannot serve personal scores.
- Capacitor / iPad loads of personal scores require an Access session for the production hostname (same-origin cookie).
- OMR or manual conversion quality varies by piece; complex scores need MuseScore cleanup after recognition.
- Extends the “no accounts / no cloud user library” stance of ADR 0001 for *public* users: only the owner’s allowlisted email reaches KV-backed scores.
- If R2 is later enabled, the Worker can switch the storage binding without changing the Access or UI contract.

## Code anchors

- `worker/index.ts`, `worker/access.ts`
- `src/score/privateSamples.ts`, `src/ui/LibraryBrowser.tsx`
- `wrangler.jsonc`, `docs/private-scores.md`
