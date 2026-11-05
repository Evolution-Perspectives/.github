# Proposal

## Why

The automations are plain JavaScript run through composite actions that wrap `actions/github-script` and load a `.js` file from the action folder. That works, but it has no type checking over the GraphQL response shapes, the write types and the sweep's snapshot model, it keeps a wrapper layer on top of a JavaScript action we could be, and it leaves open whether a remote composite action can load shared `lib/` files (never proven). The mainstream, officially templated pattern is a TypeScript JavaScript action bundled into a committed `dist/` and run on the runner's own Node 24: of 72 popular JavaScript actions surveyed, 50 are TypeScript and 55 declare `node24`, including GitHub's own `checkout`, `cache` and `github-script`. A self-contained bundle also removes the shared-library question, because everything an action needs is inside its `dist/index.js`.

## What Changes

- Add one TypeScript toolchain at the repository root (pinned TypeScript 5.9, rollup, `@rollup/plugin-typescript`, `@actions/core`, `@actions/github`, `node --test` with native type stripping for tests, `tsc --noEmit` for type checks).
- Rewrite every action in TypeScript under `actions/<name>/src/`, bundled to a committed `actions/<name>/dist/index.js` declared as `runs: using: node24, main: dist/index.js`. The `engine-*.yml` wrappers, their inputs, secrets and outputs do not change.
- Move shared code to a typed `lib/` that each bundle includes at build time (no runtime dependency on repo files).
- Add a `check-dist` CI job that rebuilds and fails when a committed `dist/` differs from its source, plus Dependabot for the npm dependencies.
- Teach the layout check the new shape (`src/index.ts`, committed `dist/index.js`, `node24`, no composite or `github-script` wrapper).
- Port the existing tests with the same assertions; the sweep and the managed deploy are written in TypeScript from the start inside their own changes.
- Migrate in small PRs, pilot first (`blocking-cleanup`), dogfooding each on a disposable issue.

## Capabilities

### New Capabilities
- `typescript-actions`: how automation logic is written, built, verified and shipped as bundled TypeScript actions.

### Modified Capabilities
- `action-architecture`: the source-file, test and shared-code requirements change from composite actions with `.js` sources to bundled TypeScript actions.

## Impact

- New: `package.json`, lockfile, `tsconfig.json`, rollup config, `.node-version`, `.gitattributes`, `.github/dependabot.yml`, a `check-dist` workflow; each action gains `src/` and a committed `dist/`.
- Changed: all five `actions/*/action.yml` (composite to node24), `ci-workflow-scripts.yml`, `check-actions-layout.js` and its tests, docs, `lib/`.
- Removed at the end: the composite wrappers, the `.js` sources and tests, `lib/test-harness.js`.
- Other changes: `add-project-sweep` and `add-managed-workflows` implement in TypeScript; `restructure-to-actions` tasks 1.2 and 2.1 are superseded.
- Repository size grows by about 1.2 MB per bundle (about 270 KB gzipped) plus history per rebuild.
