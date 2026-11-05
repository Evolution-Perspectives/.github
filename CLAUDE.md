# CLAUDE.md

Org-wide GitHub workflow automation (reusable workflows, scripts, OpenSpec changes). See `.github/copilot-instructions.md` for the workflow rules (mandatory artifact set, naming, runners).

## Project schema

The structure of the org Project "Projets Digitaux" (fields, option IDs, issue types, views, built-in workflows, labels, milestones) is snapshotted in `docs/project-schema/`, and `docs/project-schema/reference/` lists what *can* exist (field types, colors, layouts, input shapes, mutations). Read these before guessing IDs or API shapes.

- Cached copy only: workflows must resolve IDs live and never import these files at runtime.
- Do not edit by hand. Refresh with `node .github/scripts/refresh-project-schema.js` (`--check` reports drift).
- A weekly workflow opens a PR when the project structure changes.

## Layout

One TypeScript action per automation in `actions/<name>/` (`action.yml` with `runs: using: node24`, `src/` with tests, a committed bundle `dist/index.js`, README); shared typed code in `lib/`; flat `.github/workflows/` with role prefixes (`engine-` reusable wrapper, `org-` issue-event caller, `hook-` dispatch-fed, `ops-` maintenance, `ci-` validation). Each `engine-*.yml` calls exactly one action by full path and ref and selects its runner with a `runner` input (default `ubuntu-latest`); the self-hosted label `ep-github-runner` lives only in managed caller templates (see `docs/runner-pool.md`). Commands: `npm ci`, `npm run check` (types, tests, build), `node .github/scripts/check-actions-layout.js`; rebuild and commit `dist/` with every source change (CI enforces it). Contributor guide: `docs/typescript-actions.md`.

## OpenSpec

Active changes under `openspec/changes/*` are gitignored; only `openspec/changes/archive/` is tracked.
