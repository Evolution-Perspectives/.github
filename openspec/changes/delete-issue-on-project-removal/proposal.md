## Why

The project is the source of truth for active work. When an issue-backed item is removed from the project, leaving the repository issue alive creates governance drift and stale backlog noise.

This change enforces strict lifecycle behavior: when an issue is removed from the project scope, the issue is hard-deleted rather than closed.

## What Changes

- Add org-standard automation that deletes a repository issue when its project item is removed from the target Projects v2 board.
- Package logic in a reusable workflow in the org `.github` repository and expose thin trigger/template workflows for downstream repositories.
- Add safety checks so deletion only occurs when the issue is confirmed to no longer belong to the target project at execution time.
- Provide dry-run mode and clear run summaries for rollout and auditability.

## Capabilities

### New Capabilities

- `project-item-removal-issue-deletion`: Delete issue-backed work items when they are removed from the project source of truth.

### Modified Capabilities

- None.

## Impact

- GitHub Actions workflows in org repositories (dispatch trigger plus reusable workflow call).
- Org-level secret usage for a PAT that can execute GraphQL `deleteIssue`.
- Project governance behavior by eliminating orphan issues after project removal.
