# Tasks

## 1. Snapshot model and GraphQL read

- [x] 1.1 Create `actions/sweep/` (`action.yml` with `using: node24`, `src/index.ts`, `src/sweep.ts` exporting `readSnapshot`, the stage planners and typed write unions, `README.md`) on the TypeScript toolchain, reusing the typed `lib/` retry helper. Verify: `npm run typecheck && npm run build` succeed and `node actions/sweep/dist/index.js` fails cleanly without inputs and `node .github/scripts/check-actions-layout.js` passes once task 6.1 adds the engine.
- [x] 1.2 Implement the paginated project read (item id, issue id/number/repo/state/stateReason/updatedAt, Status, `blockedBy`, `blocking`, item `updatedAt`) and the live Status option lookup by name, failing when a required option is missing. Verify: unit test with a mocked `gh` returns a normalized snapshot and throws on a missing option.

## 2. Close planner

- [x] 2.1 Implement `planClose` (close open issues whose Status is Done, Pending Release or Canceled; never reopen) returning `{ writes, report }`, and `applyWrite` to patch the snapshot. Verify: `node --test` cases for each scenario in the "Open issues follow a closing Status" requirement.

## 3. Status planner

- [x] 3.1 Implement `planStatus` (empty or non-closing Status; completed → Done, In Review → Pending Release, Pending Release kept, not planned/duplicate → Canceled) and the mismatch `report` for closing Statuses that disagree with the close reason. Verify: tests for each scenario in "Status follows close reason" and "Mismatched close reason is reported, not changed".

## 4. Blocking planner

- [x] 4.1 Implement `planBlocking` removing every "blocked by" edge whose blocker is closed in the working snapshot, keeping edges to open blockers. Verify: tests for the scenarios in "Stale blocking edges removed", including a blocker closed by `planClose` in the same run.

## 5. Pipeline, cap and writes

- [x] 5.1 Implement the stage pipeline (close → Status → blocking) over one snapshot, the recent-touch skip, and the write cap check before any write. Verify: tests that a plan over the cap writes nothing and fails, and that a second run on the resulting state plans zero writes (idempotence).
- [x] 5.2 Implement the writers (`closeIssue`, `updateProjectV2ItemFieldValue`, `removeBlockedBy`), sequential with a pause, patching the snapshot only on success, with per-item failure isolation and a failed exit when any write failed. Verify: tests with a mocked writer where one call throws: the other items are processed, the failed item is unchanged in the snapshot, the dependent blocking removal is not planned, and the exit status is failure.
- [x] 5.3 Implement the run summary (applied/planned/failed/skipped/mismatches per stage, dry-run banner) written to `GITHUB_STEP_SUMMARY`. Verify: test on the formatter output for a mixed result.

## 6. Workflow and docs

- [x] 6.1 Add `.github/workflows/engine-project-sweep.yml` (`workflow_call`: `dry_run`, `max_writes` default 1000, `debug`; `automation_pat` secret; calls `actions/sweep` at `main`, a `v<number>` tag or a SHA) and `.github/workflows/ops-project-sweep.yml` (weekly cron `7 2 * * 5`, Friday 02:07 UTC, `workflow_dispatch` with `dry_run` default true, `concurrency: project-sweep` with `cancel-in-progress: false`, `permissions: contents: read`, `EP_AUTOMATION_PAT`). Verify: `gh workflow list` shows both and `node .github/scripts/check-actions-layout.js` passes.
- [x] 6.2 Confirm `ci-workflow-scripts.yml` runs `actions/sweep/src/*.test.ts`, the type check, `check-dist` and the layout check on pull requests (no separate validation workflow). Verify: the check runs on the PR and fails on a planted failing test.
- [x] 6.3 Document in `usecases.md` that the sweep does not share a concurrency group with the event workflows (groups are per repository) and how races are handled. Verify: section present and consistent with the spec.
- [x] 6.4 Add a use case to `usecases.md` describing the sweep stages, the schedule, dry-run, the cap and the reported mismatches. Verify: section present and consistent with the spec.

## 7. Live validation

- [x] 7.1 Run the sweep manually in dry-run on the live project and review the planned writes with the owner (expect the 2 open issues blocked by closed hubspot-theme#252 and the Status/close mismatches); save the run id and conclusion. Verify: summary matches an independent query of the same drift (skip path: nothing is written in dry-run).
- [x] 7.2 After approval, run it with `dry_run=false`, then run it again. Verify: the second run plans zero writes, and a final state check through `gh api` shows the stale blocking edges are gone; record the run ids and proof log lines.
- [x] 7.3 Clean up any temporary issues or branches created for validation. Verify: none remain.

## Live validation record and what is left

- 7.1 done (2026-11-05): the dry run on the live project read 383 issue items and planned 8 writes, all removals of stale "blocked by" links (way2be #146, #147, #152, #178 and hubspot-theme #243, #250, #253, #254); no close and no Status write. Nothing was written.
- 7.2 performed on 2026-11-05: a fresh dry run planned 8 stale "blocked by" removals (way2be and hubspot-theme); the real run (run 41996679006) applied them; a second dry run (run 41996786976) planned zero writes. `SWEEP_WRITE` is now `true`, so the Friday run writes.
