# Private personal scores (ADR 0018)

Personal MusicXML lives in Workers KV and is gated by Cloudflare Access. The public GitHub repo never contains score bytes.

## Cloudflare Access (one-time)

1. Zero Trust → **Access** → **Applications** → **Add an application** → **Self-hosted**.
2. Application domain:
   - `musicmind.wildideazone.com/samples/private/*`
   - Optionally also `musicmind.wildideazone.com/api/private-scores*`
3. Identity: **One-time PIN** (email).
4. Policy: **Allow** → Include → **Emails** → `dwisnows@gmail.com` (or your `OWNER_EMAILS` list).
5. Copy the application **AUD** tag. This account’s team domain is `dwisnows.cloudflareaccess.com`.

```bash
npx wrangler secret put CF_ACCESS_TEAM_DOMAIN
# paste: dwisnows.cloudflareaccess.com

npx wrangler secret put CF_ACCESS_AUD
# paste the Access application AUD tag from the app you just created
```

The Access API token used by automation could not create this app (403). Create it once in the Zero Trust dashboard as above. Until `CF_ACCESS_AUD` is set, production returns 403 for private scores (fail closed).

`OWNER_EMAILS` defaults to `dwisnows@gmail.com` via `wrangler.jsonc` `vars`. Override with a secret if needed.

## Local development

Create `.dev.vars` (gitignored via `*.local` / do not commit):

```
PRIVATE_SCORES_DEV_BYPASS=1
OWNER_EMAILS=dwisnows@gmail.com
```

With bypass set and Access secrets unset, private routes allow the owner email without a JWT. Never set `PRIVATE_SCORES_DEV_BYPASS` in production.

Optional Access stub (when testing JWT paths in wrangler):

```jsonc
// in wrangler.jsonc under top-level "access"
"access": {
  "dev": {
    "aud": "local-dev",
    "identity": { "email": "dwisnows@gmail.com" }
  }
}
```

## Upload a converted score

```bash
# After converting under private-staging/
npx wrangler kv key put --binding=PRIVATE_SCORES --remote beat-it.mxl --path=private-staging/beat-it.mxl
```

Register the same filename in `src/score/privateSamples.ts` (`path: "/samples/private/beat-it.mxl"`).

## Source of truth (private GitHub)

Converted MusicXML and page PNGs live in the private repo
[dwisnowski/music-mind-scores](https://github.com/dwisnowski/music-mind-scores)
(`scores/*.musicxml`, `sources/`). Do not commit those files into this public repo.

Local copies may still exist under gitignored `private-sources/` / `private-staging/` for conversion work. Never place them under `public/`.

Production currently serves personal scores from Workers KV (keys match `scores/` filenames). Re-upload after editing:

```bash
npx wrangler kv key put --binding=PRIVATE_SCORES --remote moonlight-sonata.musicxml \
  --path=../music-mind-scores/scores/moonlight-sonata.musicxml
```
