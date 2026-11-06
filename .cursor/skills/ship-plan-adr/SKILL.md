---
name: ship-plan-adr
description: >-
  After a successful Cursor plan execution that creates or updates an ADR under
  docs/adr/, automatically commit, push, and deploy. Use when finishing
  implement-the-plan work that wrote docs/adr/NNNN-*.md, when plan todos are all
  complete and an ADR was part of the delivery, or when the user asks to
  ship/commit/push/deploy after an ADR-backed plan.
---

# Ship plan + ADR

## When this applies

Run this workflow **automatically** at the end of a turn when **all** are true:

1. A Cursor **plan was executed** successfully (implementation finished; plan todos completed or clearly done).
2. An **ADR was created or updated** under `docs/adr/` (and usually `docs/README.md` index) as part of that work.
3. There are **local changes** left to ship (uncommitted and/or unpushed), or deploy is still needed after push.

Do **not** run for: plan-only / research turns, failed or abandoned implementations, ADR-only doc edits with no plan execution, or when the user explicitly says not to commit/push/deploy.

This skill **is** explicit authorization to commit, push, and deploy for the matching change set — do not wait for a separate “please commit” message.

## Workflow

Copy and track:

```
Ship progress:
- [ ] 1. Verify gate (plan done + ADR in diff)
- [ ] 2. Commit
- [ ] 3. Push
- [ ] 4. Deploy
- [ ] 5. Report URLs / results
```

### 1. Verify gate

- Confirm the session executed a plan (not merely drafted one).
- Confirm `docs/adr/` has a new or modified `NNNN-*.md` in the working tree or the commit about to be made.
- If the gate fails, stop and do not commit.

### 2. Commit

Follow the repo git commit protocol (status, diff, log in parallel; stage relevant files; HEREDOC message; never `--no-verify` / amend / force unless the user already required it).

- Include implementation + ADR + `docs/README.md` index in one commit when they belong together.
- Do **not** commit secrets (`.env`, credentials, etc.).
- Message: concise, why-focused; mention the ADR number when useful (e.g. `Add Free Practice mode (ADR 0012)`).

### 3. Push

```bash
git push -u origin HEAD
```

Use full network permissions. If no upstream exists, set it with `-u`. Do not force-push to `main`/`master`.

### 4. Deploy

From the repo root:

```bash
npm run deploy
```

(`build` + `wrangler deploy` for this project.) If deploy fails after a successful push, report the error and fix if straightforward; do not leave the user without the failure output.

### 5. Report

In the final reply, briefly include:

- Commit subject / short hash
- That push succeeded (remote branch)
- Deploy result (Workers/Pages URL or wrangler success line)

## Out of scope

- Creating the ADR itself — that remains the plans-as-ADRs rule.
- Opening a PR unless the user asked for one.
- Deploying unrelated dirty files from other work; if the tree mixes unrelated changes, commit only the plan/ADR change set or ask once which paths to include.
