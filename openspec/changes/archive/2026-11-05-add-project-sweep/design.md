# Design

## Context

See proposal.md for motivation. Current state:

- `close-issue-sync-status` and `remove-blocking-on-close` trigger on `issues: closed`, so they only run for this repo's own issues. `status-sync-issue-close` runs org-wide through the `projects-v2-item-updated` relay.
- The existing automations are composite actions in `actions/<name>/` (see the `restructure-to-actions` change): logic in real source files with tests next to them, called through an `engine-*.yml` wrapper. They are being migrated to bundled TypeScript actions (change `migrate-actions-to-typescript`), and the sweep is written in TypeScript from the start on that toolchain.
- Status option IDs are currently hard-coded in those workflows. `refresh-project-schema.js` shows the repo's other pattern: a Node script run with `gh`, token from `EP_AUTOMATION_PAT`.
- The org is on the free plan: no org rulesets or required workflows. `.github` is public, so its workflows are callable from any repo, but this change deploys nothing to repos.
- Project: `PVT_kwDOCIcusc4BOGrD`, about 380 items, 4 pages at 100.

## Goals / Non-Goals

**Goals:**
- One central, idempotent reconciliation run that heals what the event workflows miss.
- Each concern (close state, Status, blocking) isolated, pure and unit-tested.
- A single read of the project per run.

**Non-Goals:**
- Replacing the event workflows or changing their rules.
- Deploying callers to product repos.
- Touching issues that are not in the project.
- Fixing mismatched close reasons (reported only).
- Building or sending a recap email (planned later as a separate action, see Decisions).

## Decisions

**An action in `actions/sweep/`, not an inline script.** `src/sweep.ts` exports pure, typed functions (`readSnapshot`, the planners, `applyWrite`) and `src/index.ts` is the entry that reads inputs through `@actions/core`; `src/sweep.test.ts` imports the source directly, and the committed `dist/index.js` is what runs (`node24`). It is called through `engine-project-sweep.yml` (reusable wrapper, as every action) and scheduled by `ops-project-sweep.yml` (cron and `workflow_dispatch`). Alternative: inline script extracted from YAML. Rejected: three stages and an in-memory model are awkward to test through extraction. API calls use the authenticated Octokit of `@actions/github` with the typed retry helper of `lib/`; the snapshot, write and stage types are discriminated unions, so a missing write type is a compile error.

**Pipeline over one snapshot.** `snapshot → planClose → planStatus → planBlocking`. Each planner is `(snapshot, ctx) → { writes, report }`; a separate `applyWrite` patches the snapshot in memory. Alternative: three reusable workflows each reading the project (three reads, each stage re-reads fresh state). Rejected: wasteful, and it only buys freshness that the in-memory model gives for free.

**The sweep closes but never reopens.** The event relay applies a Status move (including the reopen) live, so a closed issue with a non-closing Status almost always means a missed close event in a product repo. Reopening would undo a legitimate human close; realigning Status is harmless. Open issues with a closing Status are closed, following `usecases.md` ("the Status → close mapping always applies").

**Stage order: close, Status, blocking.** Closing runs first; the Status stage then only touches items whose Status is empty or not a closing Status, so the two cannot undo each other. Blocking runs last because it depends on the final closed set.

**Apply stage by stage.** After planning a stage, its writes are applied; successful writes patch the snapshot, failed ones leave the item unchanged so later stages do not plan on a false assumption. Writes are sequential with a short pause to stay under secondary rate limits.

**Rules ported, not invented.** Close and Status-from-reason rules are copied from `engine-sync-close-state.yml` and `engine-sync-status-on-close.yml` into pure functions. A mismatch (closed completed in Canceled, closed not planned in Done) is returned as a `report` entry, never a write, matching "a human chose that".

**Status options resolved live.** The runner queries the Status field's options and maps by name (`🏆 Done`, `❌ Canceled`, `📤 Pending Release`, `🧪 In Review`). If a name is missing the run fails before any write. This avoids the hard-coded IDs that already exist in the event workflows.

**Cap before write.** Planning is pure and completes for all stages first against a copy; the total is compared to `max_writes` (default 1000). Over the cap fails with the plan in the summary and writes nothing. In dry-run the same plan is printed.

**Own concurrency group `project-sweep`, `cancel-in-progress: false`; no group shared with the event workflows.** Concurrency groups are scoped to one repository, and the event workflows run in the product repos, so a shared group is impossible there. Inside `.github` a shared group would also drop pending runs by default (`queue: single` keeps one pending run), losing events in a burst. The sweep therefore only protects itself from overlapping; races with live events rely on the recent-edit skip and on writes that are safe to repeat (closing a closed issue, setting the same Status, removing an absent link).

**Skip recently touched items.** Items whose issue or project item changed in the last 10 minutes are skipped and listed, so a human editing is not overridden.

## Risks / Trade-offs

- [A wrong rule mass-closes issues or rewrites Status] → dry-run default on manual runs, write cap, and a first live run reviewed in dry-run before the schedule is enabled.
- [Sweep and a live event race] → the recent-touch skip and idempotent writes (no shared concurrency group, see Decisions).
- [PAT lacks scope for a repo] → per-item failure isolation; the run ends failed with the repo named.
- [Re-closing an issue a human reopened in the UI while Status is still Done] → Status is the documented authority; the recent-touch skip limits the window, and the case is visible in the summary.
- [Edge removal is permanent] → only edges whose blocker is closed are removed, the same rule the event workflow applies on close.
- [Items outside the project are invisible] → accepted; add-to-project workflow is the control there.

## Migration Plan

1. Merge workflow, script and tests with the schedule present but the scheduled run in dry-run (input default).
2. Run a manual dry-run on the live project and review the planned writes with the owner.
3. Enable writes for the schedule.
4. Rollback: disable the workflow in the Actions UI; nothing else depends on it.

## Open Questions

- Whether to also remove "blocked by" edges on closed issues whose blocker is still open (not in this change).
- Whether a failed sweep should open an issue rather than only turn the job red.

**Weekly cadence for now, Friday early morning.** The sweep runs once a week (owner's choice), `7 2 * * 5` (Friday 02:07 UTC, 03:07 or 04:07 in Paris). The team's week starts on Friday: Thursday is the testing review, replan and corrections day and sprints begin on Fridays, so the board is clean and, later, the recap is ready when the sprint starts. Most closes and board movements happen during Thursday's review itself, so the drift is created that day; a run early Friday cleans it a few hours later, whereas a Thursday-morning run would have come before it. Drift created Monday to Wednesday waits for Friday, and a manual dispatch covers urgent cases. The odd minute avoids the top-of-hour queue. The sweep stays weekly while the managed callers are not deployed yet, accepting up to a week of drift on issues closed in product repos. The cron is one line; manual dispatch covers urgent cases. The per-stage write counts in each run summary show whether drift is rare enough to keep weekly or large enough to move to daily.

**Recap is a later, separate action.** A weekly recap (build, then email) is planned but out of scope here. It would be its own action behind its own `engine-` wrapper, run after the sweep in the same scheduled workflow so it reflects the corrected board, read-only, and its failure must not fail the sweep. It would reuse the snapshot reader, and needs a mail channel and secret decided in its own change.
