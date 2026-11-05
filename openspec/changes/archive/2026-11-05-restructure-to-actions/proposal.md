# Proposal

## Why

Business logic for the five `engine-*` workflows lives as inline `github-script` code inside flat YAML files. Tests must extract the `script:` block from the YAML to run it, shared logic (live field resolution, dry-run handling) is copy-pasted between engines, and the planned sweep and managed-deploy changes would pile more inline code on top. GitHub forces workflow files to be flat, but actions (`action.yml`) may live in any folder, which allows vertical slicing: one folder per automation holding its code, tests and docs.

## What Changes

- Introduce an `actions/<name>/` folder per automation, each a composite action holding `action.yml`, real `.js` source, co-located tests and a README.
- Introduce `lib/` for code shared by two or more actions (live project field resolution, dry-run logging, GraphQL helper).
- Reduce each `engine-*.yml` to a thin reusable-workflow wrapper that calls its action by full path, pinned to the same ref.
- Migrate the five existing engines (`add-to-project`, `close-status-sync`, `close-state-sync`, `blocking-cleanup`, `delete-on-removal`) and the schema refresh script, keeping behavior unchanged.
- Add a CI check that every action has its `engine-<name>.yml` wrapper and no wrapper is orphaned.
- Build the `add-project-sweep` stages directly as actions.
- Update `.github/copilot-instructions.md` and `CLAUDE.md` to describe the layout.
- No change to workflow file names, triggers, inputs or behavior: callers pinned to `@main` or `@v1` keep working.

## Capabilities

### New Capabilities
- `action-architecture`: repository layout contract for automation logic (actions folder, shared lib, wrapper correspondence, testability, ref pinning).

### Modified Capabilities

## Impact

- `.github/workflows/engine-*.yml` (body shrinks), new `actions/`, new `lib/`, `.github/scripts/*.test.js` (move next to actions), `ci-workflow-scripts.yml` (test paths, wrapper check), `.github/copilot-instructions.md`, `CLAUDE.md`, `usecases.md`.
- Cross-repo callers: unchanged inputs; a cross-repo call now needs the action pinned to the same ref as the workflow.
- Depends on a spike confirming a remote composite action can load `../../lib` files via `$GITHUB_ACTION_PATH`.

## Outcome (archived 2026-11-05)

Shipped (PR #37). Each automation lives in `actions/<name>/`, called by a flat `engine-*.yml` wrapper, with a layout check in CI. The composite-action and `.js` implementation described here was replaced by bundled TypeScript actions (change `migrate-actions-to-typescript`, PRs #41 and #46): `action.yml` now declares `runs: using: node24`, sources are `src/*.ts`, and each action ships a committed, self-contained `dist/index.js`. The shared-`lib/`-through-`action_path` design was dropped for the same reason (a bundle needs no other repository file).
