# Design

## Context

State today (2026-11-05): five actions in `actions/<name>/` are plain JavaScript (`*.js` + `*.test.js`) loaded by a composite `action.yml` through `actions/github-script`; `engine-*.yml` wrappers call them at `@main` and now take a `runner` input; the layout check enforces the shape; 46 tests pass. The sweep exists only as an untested JavaScript draft; the managed deploy is not started. Four self-hosted runners (own Node 24 bundled) and GitHub-hosted runners both execute JavaScript actions.

Evidence gathered for this design (see proposal):
- GitHub's template `actions/typescript-action` ships `runs: using: node24`, `main: dist/index.js`, a rollup bundle and a `check-dist` workflow; GitHub's docs say to bundle dependencies and not commit `node_modules`. Of 72 JavaScript actions in the top-starred sample, 50 are TypeScript and 55 declare `node24`; `checkout`, `cache`, `upload-artifact`, `github-script` and `setup-*` are TypeScript. Node 20 is no longer available on runners (changelog 2026-09-23).
- Spike on this machine (Node 24.18): a two-file project importing `./util.ts` type-checks with `tsc --noEmit` (`allowImportingTsExtensions`, `erasableSyntaxOnly`), its test runs natively with `node --test`, `@rollup/plugin-typescript` bundles it into one 1.2 MB file (266 KB gzipped) that runs. Install 31 packages (62 MB), bundle about 3 s, typecheck about 1.3 s. TypeScript 7.0.2 (latest on npm) crashes the rollup plugin (`reading 'ES2015'`), so TypeScript is pinned to 5.9.
- Billing: the build runs in `.github` (public, free) and never at run time; the bundle adds nothing to the per-job minute.

## Goals / Non-Goals

**Goals:**
- Typed, self-contained, reproducible actions; one language; no wrapper layer.
- No change for callers: engine inputs, secrets and behavior stay identical.
- A migration that can be reverted one action at a time.

**Non-Goals:**
- eslint, prettier, jest or coverage tooling (can be added later as their own change).
- GraphQL schema code generation (response shapes are typed by hand; `@octokit/graphql-schema` is an option to evaluate later).
- Publishing to the Marketplace, changing engine contracts, or touching the self-hosted runner pool.
- Migrating `refresh-project-schema.js` (a local maintenance script, not an action).

## Decisions

- **Bundled JavaScript action on `node24`, not a composite action running TypeScript natively.** The runner brings its own Node 24 (pool and hosted), so nothing is needed on the machine; the VPS has no Node on its PATH and a native-stripping composite would need `setup-node` in every pool job. Alternative rejected: native stripping in composite steps (works, but unconventional and PATH-dependent).
- **One root toolchain, one `dist/` per action.** `rollup.config` globs `actions/*/src/index.ts` and writes `actions/*/dist/index.js` (ES module output as in the template); shared `lib/*.ts` is imported with relative `.ts` paths and bundled into each action. Alternative: one `package.json` per action, rejected as duplicated lockfiles for no isolation gain.
- **Bundler: rollup with `@rollup/plugin-typescript`, `@rollup/plugin-commonjs`, `@rollup/plugin-node-resolve`.** It is what GitHub's template uses. The known harmless warning (`this` rewritten in `@actions/core`) is silenced in `onwarn`. `esbuild` (maintained, faster) is the fallback if the plugin breaks again.
- **Tests: `node --test` on `*.test.ts` with native type stripping; type checking with `tsc --noEmit`.** Requires Node 24 (`.node-version`, `actions/setup-node` in CI), `erasableSyntaxOnly` (no enums, namespaces with code or parameter properties; use string unions and const objects) and `.ts` import extensions. Alternative: jest + ts-jest as in the template, rejected for the dependency weight (the template installs 707 packages, 371 MB).
- **Runtime libraries: `@actions/core` (inputs, outputs, summary, logging) and `@actions/github` (authenticated Octokit with GraphQL).** Retries are a small helper in `lib/` (the same logic as the draft sweep) instead of another dependency. Inputs are typed and validated once in each `index.ts` (node ID and repository patterns), and the action never builds code from inputs, which removes the script-injection class entirely.
- **`dist/` is committed, marked generated (`.gitattributes` `linguist-generated`) and without sourcemaps** to keep size and review noise down; a `check-dist` workflow rebuilds from `npm ci` and compares. Alternative: build in the engine at run time, rejected (adds minutes and a failure mode to every job).
- **Pilot first, then batches, each in its own pull request** and each dogfooded: `blocking-cleanup` (simplest, 7 tests), then `add-to-project`, `close-status-sync`, `close-state-sync`, `delete-on-removal`. The sweep and the managed deploy are built in TypeScript inside their own changes against the same toolchain.
- **`@main` stays the engines' action ref** until the `v1` tag exists; a bad merge affects `.github`'s own automations immediately, hence the per-PR dogfood and the revert path.

## Safe validation sequence, tokens and cleanup

- Per migrated action: unit tests and `tsc` and `check-dist` in the PR; merge; then dogfood in `.github` with a disposable issue (open, close) and read the run logs (run IDs, proof lines, final project state through the API).
- Destructive action (`delete-on-removal`): validate both paths on a disposable issue through the hook's `workflow_dispatch`: skip path (the issue is still in the project, so nothing is deleted) and execute path (item removed from the project, then dispatch, issue deleted), with dry-run first.
- Tokens: the existing `EP_AUTOMATION_PAT` secret (repo and project scope) is unchanged; if its scopes are missing the run fails with the API error and nothing is written. The API token used for pushes lacks the `workflow` scope, so workflow files are pushed over SSH.
- Cleanup: every disposable issue is deleted and its absence verified; temporary branches and runs are deleted; the final state is checked with `gh api`.

## Risks / Trade-offs

- [A faulty bundle breaks the live automations] → port tests first, `check-dist`, PR-by-PR dogfood, revert restores the composite version because the action path is unchanged.
- [`dist/` drifts from the source] → `check-dist` on every PR touching sources, lockfile or config.
- [Supply chain: dependencies are bundled into committed files] → lockfile, `npm ci`, reviewed Dependabot PRs, reproducible build so a reviewer can rebuild and compare.
- [Toolchain breakage on upgrades (TypeScript 7 vs the rollup plugin)] → pinned versions, the build check fails before merge, esbuild as fallback.
- [Repository growth, about 1.2 MB per bundle] → no sourcemaps; five to seven bundles; revisit if history growth hurts.
- [Native type stripping limits the TypeScript subset] → enforced by `erasableSyntaxOnly`, documented in the contributor guide.
- [Two languages during the migration] → one action at a time, the layout check accepts both shapes until the last action moves, then forbids the old one.

## Migration Plan

1. Toolchain and CI, no behavior change. 2. Typed `lib/`. 3. Pilot `blocking-cleanup`, dogfood. 4. Port the other four, dogfood each. 5. Remove the old shape, tighten the layout check, update docs. 6. Close out `restructure-to-actions` (tasks 1.2 and 2.1 superseded, archive so `action-architecture` reaches the main specs), then record the supersession of its composite/`.js` requirements. Rollback: revert the PR of the affected action.

## Open Questions

- Add eslint/prettier now or in a follow-up change (default: follow-up).
- Whether to evaluate `@octokit/graphql-schema` for response types once the first two actions are typed by hand.
