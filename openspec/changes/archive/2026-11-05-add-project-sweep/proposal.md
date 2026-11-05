# Proposal

## Why

The event workflows that keep issues and the project in step only fire for issues in this `.github` repo: `org-issue-closed-sync-status.yml` and `org-issue-closed-remove-blocking.yml` trigger on `issues: closed`, which GitHub raises only for the repo that holds the workflow. Only the Status → close direction (`hook-project-item-updated-sync-close-state.yml`, fed by the org `projects-v2-item-updated` relay) works org-wide. In the product repos this leaves stale state: hubspot-theme#252 is closed but still blocks open #253 and #254, and issues closed in the UI do not move their Status. Cancelled or failed runs are never retried, so the state never heals.

## What Changes

- Add a scheduled, central **project sweep** that reads the whole org project once and reconciles drift in three ordered stages:
  1. **Close state**: Status `🏆 Done`, `📤 Pending Release` or `❌ Canceled` with an open issue closes it; any other Status with a closed issue reopens it (same rules as `status-sync-issue-close`).
  2. **Status**: a closed issue whose Status does not match its close reason is realigned (same rules as `close-issue-sync-status`).
  3. **Blocking**: an issue "blocked by" a closed issue loses that edge.
- Logic lives in one tested module of pure per-stage planners; a thin runner reads once, runs the stages in order against an in-memory snapshot, and applies writes.
- Safety: dry-run by default for manual runs, a per-run write cap, per-item failure isolation, never overlapping itself (own concurrency group) and tolerant of concurrent event workflows (recent-edit skip, idempotent writes).
- Run summary lists every change, failure and skipped item; mismatches that need a human decision are reported, not changed.
- No file is added to any product repo; the sweep needs no per-repo setup.

## Capabilities

### New Capabilities
- `project-sweep`: scheduled reconciliation of issue close state, project Status and blocking relationships across all repos in the org project.

### Modified Capabilities

## Impact

- New: `actions/sweep/` (`action.yml`, `src/*.ts` with `*.test.ts`, committed `dist/index.js`, README), `.github/workflows/engine-project-sweep.yml` (reusable wrapper) and `.github/workflows/ops-project-sweep.yml` (schedule). CI validation comes from the existing `ci-workflow-scripts.yml`.
- Depends on `migrate-actions-to-typescript` (toolchain and typed `lib/`, its task groups 1 and 2); the actions layout from `restructure-to-actions` has landed.
- Uses `EP_AUTOMATION_PAT` (repo and project write scope); reads Status option IDs live from the project, nothing imported from `docs/project-schema/`.
- `usecases.md` gains a use case for the sweep.
- Existing event workflows are unchanged. Deploying event callers to product repos stays out of scope.
