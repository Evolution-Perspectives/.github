# Tasks

## 1. Spike

- [x] 1.1 Create `actions/blocking-cleanup/` (action.yml, cleanup.js) and make `engine-remove-blocking-on-close.yml` call it; verify the existing 7 tests pass against `cleanup.js` loaded by `require`

## 2. Shared lib

- [x] 2.2 Add the guard test scanning `actions/` and `lib/` for `PVTSSF_|PVT_kw` literals and verify it fails on a planted literal

## 3. Migrate engines

- [x] 3.1 Migrate `add-to-project` and verify its 6 tests pass unchanged in intent
- [x] 3.2 Migrate `close-status-sync` and `close-state-sync` and verify their 16+ tests pass
- [x] 3.3 Migrate `delete-on-removal` and verify its tests pass, including the injection validation cases
- [x] 3.4 Keep `refresh-project-schema.js` in `.github/scripts/` (a repo-local maintenance script, not a remotely callable action) and verify `--check` still runs
- [x] 3.5 Add a README per action (use case, inputs, dry-run) and verify each is linked from `usecases.md`

## 4. Enforcement and docs

- [x] 4.1 Add the wrapper-correspondence check to `ci-workflow-scripts.yml`, also failing any `engine-*.yml` whose action ref is not `main`, a `v*` tag or a full SHA (secrets must never go to a feature-branch ref), and verify it fails on a temporary orphan and on a feature-branch ref, and passes on the real tree
- [x] 4.2 Update `ci-workflow-scripts.yml` test paths and verify a PR run is green
- [x] 4.3 Update `.github/copilot-instructions.md`, `CLAUDE.md` and `usecases.md` for the new layout and verify no doc still references `.github/scripts/*.test.js`

## 5. Sweep alignment

- [x] 5.1 Update `add-project-sweep` tasks so the close, status and blocking stages are built as actions reusing `lib/`, and verify the change still validates with `openspec validate add-project-sweep`

## Not performed

These tasks were superseded by `migrate-actions-to-typescript`: its bundled `dist/index.js` files contain their dependencies and the shared `lib/`, so a remote call needs no `../../lib` and the open question that 1.2 and 2.1 were meant to answer no longer exists.

- 1.2 (prove a cross-repository call loads a `../../lib` module) and 2.1 (extract shared helpers into `lib/` after that proof): replaced by the typed `lib/` bundled into each action.
