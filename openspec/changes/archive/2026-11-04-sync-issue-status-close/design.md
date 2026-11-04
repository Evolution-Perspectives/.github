## Context

The org project already has a repository_dispatch relay (source is org-level, outside this repo) that fires `projects-v2-item-updated` on any Project v2 item field edit, consumed today by `projects-estimation-rollup.yml`. That consumer follows a **reconcile pattern**: on dispatch, it re-reads current item state via GraphQL rather than trusting a diff in the payload, and only writes when the computed value differs. We follow the same pattern here, since the relay's `client_payload` does not reliably tell us *which* field changed — only that the item changed.

Issue close events (`issues: closed`) do carry `state_reason` directly on the payload, so Direction A does not need an extra read.

Constraints: `EP_AUTOMATION_PAT` secret for GraphQL mutations (issue close/reopen, Project v2 field update), same as existing automation workflows. Target project is the main org project (`PVT_kwDOCIcusc4BOGrD`, per `project-structure.json`).

## Goals / Non-Goals

**Goals:**
- Issue closed as `completed` → Status `🏆 Done`; closed as `not_planned`/`duplicate` → Status `❌ Canceled`.
- Status set to `🏆 Done` → issue closed as `completed`; Status set to `❌ Canceled` → issue closed as `not_planned`.
- Closed issue moved to any other Status → issue reopened.
- No infinite loop between the two directions (each write is idempotent against current state).
- Project items with no linked issue (drafts, PRs) are no-ops for the Status→close/reopen direction.

**Non-Goals:**
- Reacting to a manual `issues: reopened` event by resetting Status (not requested — only Status changes drive reopen).
- Handling `Paused` or any other Status value beyond "not Done/Canceled while closed → reopen".
- Cross-project support — scoped to the single main org project.

## Decisions

- **Reconcile-on-dispatch for Direction B** (Status → close/reopen), instead of parsing `client_payload` for the changed field: matches the existing `projects-estimation-rollup` consumer of the same relay event, and is robust to relay payload changes. Each run fetches the item's current Status option name and the linked issue's current `state`/`state_reason`, computes the target close state, and only mutates if they differ.
- **Idempotency as the loop guard**: rather than tagging commits/actors to suppress self-triggered re-runs, both directions simply skip the write when current state already matches the target. Direction A closing an issue sets Status Done → relay fires → Direction B reconciles, sees issue already `completed`-closed and Status already `Done` → no-op. Same in reverse. Bounded to at most one extra no-op hop per direction, no unbounded loop.
- **Two workflow pairs, following the existing `<name>.yml` (trigger) + `<name>-action.yml` (reusable, `workflow_call`) convention**: `close-issue-sync-status` (Direction A, triggered by `issues: closed`) and `status-sync-issue-close` (Direction B, triggered by the existing `projects-v2-item-updated`/`projects-v2-item-edited` dispatch types, alongside `workflow_dispatch` for manual runs — same shape as `delete-issue-on-project-removal.yml`).
- **`duplicate` and `not_planned` both map to Canceled**, but Canceled always closes back out as `not_planned` (not `duplicate`) — GitHub's close mutation only distinguishes those three reasons, and `not_planned` is the closer semantic match for a project-driven cancellation with no specific duplicate target.

## Risks / Trade-offs

- [Relay does not fire promptly, or is missing on some item edits] → Direction B is also reachable via manual `workflow_dispatch` (project_id + item_node_id inputs) for backfill/repair, same pattern as `delete-issue-on-project-removal.yml`.
- [Race: user closes issue and edits Status within the same second] → both directions are idempotent reconciles, so a second dispatch simply confirms convergence; no data loss, worst case one extra API call.
- [Draft project items (no linked issue) trigger Direction B unnecessarily] → Mitigation: fetch `content.__typename`/issue node id first; skip immediately if absent, no further API calls.
- [Token scope gaps for `issues:write` or `project:write` on `EP_AUTOMATION_PAT`] → Reuse the same secret already validated for `remove-blocking-on-close-action.yml` and `projects-estimation-rollup-action.yml`, which perform equivalent issue/project mutations — no new scope expected. Document as a precheck step; if a mutation fails on 403, the run fails loudly rather than silently skipping.

## Migration Plan

1. Validate on a dedicated branch first: run both `-action.yml` reusable workflows via `workflow_dispatch` with `dry_run: true` against a disposable test issue/project item, confirm computed target state in logs.
2. Run `dry_run: false` on the same disposable test issue for both directions (close→status, status→close, status→reopen) on the branch, capture run IDs and before/after state via `gh api`/GraphQL as evidence.
3. Delete the disposable test issue (hard delete) after validation; if hard delete isn't available, close it `not_planned` with a comment noting it was test-only.
4. Merge to default branch. Because `issues: closed` and the `projects-v2-item-updated` dispatch are only registered on the default branch, do a final smoke test post-merge on the same disposable-issue pattern (create → close → verify Status → change Status → verify close/reopen → clean up).
5. Rollback: revert the two new trigger workflow files (and their `-action.yml` counterparts); no state migration needed since each run is a stateless reconcile.

## Open Questions

- Confirm the exact `client_payload` shape and dispatch `types` values the org-level relay sends for a Status-field edit specifically (vs. any field edit) — assumed to be covered by the existing `projects-v2-item-updated` type based on the rollup consumer, to be confirmed during branch validation.
- Project id (`PVT_kwDOCIcusc4BOGrD`) and Status field id (`PVTSSF_lADOCIcusc4BOGrDzg852S8`) confirmed live via GraphQL — sourced the same way as `projects-estimation-rollup.yml` (`vars['EP_PROJECT_V2_ID']` with the same literal as fallback); no open question remains here.
