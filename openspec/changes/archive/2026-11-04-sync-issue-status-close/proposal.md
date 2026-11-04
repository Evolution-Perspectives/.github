## Why

Today, closing a GitHub issue and setting its Project Status are two disconnected manual actions (documented as such in `usecases.md`). This causes drift: issues get closed without the board reflecting it, or the board says `Done`/`Canceled` while the issue is still open. We want the issue's close state and the Project Status field to stay in sync automatically in both directions, with a safety net that reopens issues if someone moves them out of `Done`/`Canceled` after the fact.

## What Changes

- New reusable workflow that reacts to `issues: closed` and sets Project Status:
  - `state_reason: completed` → Status `🏆 Done`
  - `state_reason: not_planned` or `duplicate` → Status `❌ Canceled`
- New reusable workflow that reacts to a Status field change on the org Project (via the existing `projects-v2-item-updated` repository_dispatch relay) and:
  - Status → `🏆 Done` → close the linked issue with `state_reason: completed`
  - Status → `❌ Canceled` → close the linked issue with `state_reason: not_planned`
  - Status → anything else, while the linked issue is currently closed → reopen the issue
  - Project items with no linked issue (drafts, PRs) are skipped — no close/reopen action applies.
- Both directions are idempotent: no API write is issued if the issue is already in the target close/open state, or the Status is already the target option — this also prevents the two directions from looping off each other.

## Capabilities

### New Capabilities
- `issue-status-close-sync`: Bidirectional sync between a GitHub issue's closed/open state (+ close reason) and its Project v2 Status field, plus auto-reopen when Status is moved away from `Done`/`Canceled` on a closed issue.

### Modified Capabilities
(none — no existing specs)

## Impact

- New workflow files under `.github/workflows/`: a trigger + reusable `-action.yml` pair per direction, following the existing `remove-blocking-on-close(.yml/-action.yml)` pattern.
- Reuses the existing org-level `projects-v2-item-updated` repository_dispatch relay (already consumed by `projects-estimation-rollup.yml`) — no new cross-repo dispatch plumbing needed.
- Uses the `EP_AUTOMATION_PAT` secret and GraphQL (issue close/reopen mutations, Project v2 field update mutation), matching the existing automation workflows.
- No changes to `project-structure.json` or `usecases.md` beyond what's already in place (Status options, including `⏳ Paused`, are already synced).

## Outcome (archived 2026-11-04)

Shipped. Close to Status: engine `.github/workflows/engine-sync-status-on-close.yml` (was `close-issue-sync-status-action.yml`), logic in `actions/close-status-sync/`, caller `.github/workflows/org-issue-closed-sync-status.yml`. Status to close: engine `.github/workflows/engine-sync-close-state.yml` (was `status-sync-issue-close-action.yml`), logic in `actions/close-state-sync/`, hook `.github/workflows/hook-project-item-updated-sync-close-state.yml`. Tests: `sync.test.js` in each action folder (18 tests).

Differences from what was proposed:

- Status field and option IDs are resolved live by name; the `status_field_id` input and the hard-coded option IDs are gone, and a missing option fails before any write.
- Both directions support `dry_run` and run on `ubuntu-latest`.
- The Status to close direction has no sender: the org-level `projects-v2-item-updated` relay that this change assumed does not exist (verified), so it has never run. The close to Status direction only runs where a caller exists, today `.github` itself.
- Known risk: an item with no Status counts as an "other" status, so a closed issue with an empty Status would be reopened. Not yet fixed.
