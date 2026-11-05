# Tasks

## 1. Toolchain and CI (no behavior change)

- [x] 1.1 Add `package.json` (private, `type: module`, scripts `build`, `typecheck`, `test`, `check`), the lockfile, `tsconfig.json` (`strict`, `erasableSyntaxOnly`, `verbatimModuleSyntax`, `allowImportingTsExtensions`, `noEmit`), `rollup.config` (globs `actions/*/src/index.ts`, quiet `onwarn`) and `.node-version` (24), with `typescript` pinned to 5.9. Verify: `npm ci && npm run typecheck && npm run build` succeed on a clean checkout with a sample entry, and installing TypeScript 7 makes the build fail visibly.
- [x] 1.2 Add `.gitattributes` marking `actions/*/dist/**` generated and `.github/dependabot.yml` for npm (weekly, grouped). Verify: a test PR shows `dist` collapsed and Dependabot config is valid.
- [x] 1.3 Add the `check-dist` job (setup-node from `.node-version`, `npm ci`, build, `git diff --exit-code` on `actions/*/dist`) and make `ci-workflow-scripts.yml` run `npm ci`, `tsc --noEmit`, `node --test` and the layout check. Verify: a PR that edits a source without rebuilding fails `check-dist`, and the same PR passes after rebuilding.
- [x] 1.4 Write the contributor guide (`docs/typescript-actions.md`: erasable syntax rules, commands, how to add an action, how to upgrade Node and TypeScript). Verify: following it from a clean clone builds and tests an example.

## 2. Typed shared library

- [x] 2.1 Create `lib/` in TypeScript: node-ID and repository validators, retry helper, dry-run logger, job-summary helper, typed GraphQL response interfaces, and a typed fake GitHub for tests (port of `lib/test-harness.js`). Verify: `lib/*.test.ts` pass under `node --test` and `tsc`.
- [x] 2.2 Port the no-hardcoded-IDs guard to TypeScript and extend it to scan `src/` and `lib/` (bundles excluded). Verify: it fails on a planted ID literal.

## 3. Pilot: blocking-cleanup

- [x] 3.1 Port `blocking-cleanup` to `src/` (entry reads inputs through `@actions/core`, logic in typed modules), port its 7 tests, switch `action.yml` to `node24` and commit `dist/index.js`. Verify: tests and `tsc` pass, `check-dist` is green, and `node dist/index.js` with a dry-run input and an invalid token fails with a clear API error rather than a crash.
- [x] 3.2 Update the layout check and its tests to the TypeScript shape (accept both shapes during the migration). Verify: tests cover the new rules and the real tree passes.
- [x] 3.3 Merge and dogfood in `.github`: open and close a disposable issue, read the run IDs and the proof lines of the cleanup job, check the final state with `gh api`, then delete the issue and verify its absence. Verify: the job succeeds on the new bundle and the issue is gone.

## 4. Port the other four actions

- [x] 4.1 Port `add-to-project` and its 6 tests; dogfood with a disposable issue (project add and Status), then delete it. Verify: tests, `check-dist`, run IDs and project state recorded, issue removed.
- [x] 4.2 Port `close-status-sync` and its 11 tests; dogfood by closing a disposable issue. Verify: Status becomes Done in the project, issue removed afterwards.
- [x] 4.3 Port `close-state-sync` and its 7 tests; dogfood through `workflow_dispatch` of its hook on a disposable item (dry-run first). Verify: close and no-op paths observed, test artifacts removed.
- [x] 4.4 Port `delete-on-removal` and its 7 tests; validate both the skip path (issue still in the project, nothing deleted) and the execute path (item removed, issue deleted) on a disposable issue, dry-run first. Verify: run IDs and final state recorded for both paths, no test artifact left.

## 5. Remove the old shape and close out

- [x] 5.1 Delete the composite wrappers, the `.js` sources and tests and `lib/test-harness.js`; make the layout check forbid `composite`, `github-script` wrappers and `.js` sources under `actions/`. Verify: the layout check fails on a planted composite action and passes on the real tree; all tests pass.
- [x] 5.2 Update `CLAUDE.md`, `.github/copilot-instructions.md`, `usecases.md`, `docs/runner-pool.md` and each action README for the TypeScript layout. Verify: no document still mentions `github-script` wrappers, composite actions or `*.test.js`.
- [x] 5.3 Mark `restructure-to-actions` tasks 1.2 and 2.1 superseded (self-contained bundles make the cross-repo `lib/` question moot), archive that change so `action-architecture` reaches the main specs, then add a delta here that modifies its source-file requirements to TypeScript. Verify: `openspec validate --all` passes and the main spec describes `src/` and `dist/`.
- [x] 5.4 Confirm `add-project-sweep` and `add-managed-workflows` are written against this toolchain (done in their artifacts) and note which of their tasks wait for this change. Verify: both validate and reference `src/*.ts`.

## Workflow follow-up

- Decide whether to add eslint and prettier in a follow-up change.
- Revisit repository growth after the first few rebuilds.
- Archive this change after the review and the first week of live runs.
