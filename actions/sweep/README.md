# sweep

Weekly reconciliation of the org project. It reads the whole project once into memory, then runs three stages over that snapshot and fixes the drift that the event-driven automations miss in repositories where they do not run.

- **Called by:** `.github/workflows/engine-project-sweep.yml` (reusable engine). Schedule: `.github/workflows/ops-project-sweep.yml` (Friday 02:07 UTC and manual dispatch).
- **Source:** TypeScript in `src/` (`index.ts` reads the inputs, `sweep.ts` orchestrates, `plan.ts` holds the pure planners, `read.ts` the single project read, `execute.ts` the writes, `summary.ts` the job summary), bundled to the committed `dist/index.js` and run on `node24` (`npm run build`; CI checks the bundle is current).
- **Tests:** `src/*.test.ts` import the source directly (`npm test`); `board.testkit.ts` is a stateful fake of the project used to run the whole pipeline, including a second run to prove idempotence.
- **Dry run:** the default. Anything but `dry_run: "false"` plans and reports without writing.

## Stages

1. **Close:** an open issue whose Status is Done or Pending Release is closed as completed; with Canceled, as not planned. A closed issue is never reopened.
2. **Status:** a closed issue whose Status is empty or not a closing one gets its Status from the close reason (completed becomes Done, or Pending Release from In Review; not planned and duplicate become Canceled). A closing Status that disagrees with the close reason is only reported, as a mismatch for a human.
3. **Blocking:** every "blocked by" link whose blocker is closed is removed, for open and closed issues alike, including blockers closed by stage 1 in the same run.

## Safety

- A write cap (default 50): a larger plan writes nothing and fails the run (a dry run only warns).
- Items edited in the last 10 minutes are skipped and listed.
- One failing write does not stop the others and does not cascade into work that depends on it; the run ends failed.
- Status options are resolved live by name; a missing option fails the run before any write.
- Running it twice in a row plans zero writes the second time.
- The sweep writes with the automation token, so its closes do fire the managed callers in the product repositories (a Status or link change fires nothing). Those runs are redundant but harmless (the Status is already set, there is nothing left to unblock); to avoid a storm, closes are paced (`close_pause_ms`, 4 s by default: at most about 0.5 pool jobs per second against a capacity of about 0.6) and capped by `max_writes`.
- Concurrency groups are per repository, so the sweep only protects itself from overlapping (its own group); races with live events rely on the recent-edit skip and on writes that are safe to repeat.

## Inputs

| Input | Required | Description |
|---|---|---|
| `project_id` | yes | Node ID of the GitHub Projects v2 project to reconcile. |
| `dry_run` | no (default "true") | Plan and report without writing. Anything but "false" is a dry run. |
| `max_writes` | no (default "50") | Maximum number of writes per run. |
| `recent_minutes` | no (default "10") | Skip items edited in the last N minutes. |
| `pause_ms` | no (default "250") | Pause between writes. |
| `close_pause_ms` | no (default "4000") | Pause after each issue close, so the `issues: closed` workflows it fires in the issue's repository arrive at a rate the runner pool absorbs. |
| `debug` | no (default "false") | Enable verbose logs. |
| `token` | yes | PAT with repo and project write scope. |
