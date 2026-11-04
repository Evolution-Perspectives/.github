## Context

The organization uses a single Projects v2 board as delivery source of truth. Repository issues may be created from project workflows, but removing an item from the project does not delete the underlying issue by default.

The requested behavior is strict: project removal implies hard delete of the issue, not close/archive.

Constraints:

- Keep reusable engine + thin trigger + template architecture.
- Use least privilege at workflow/job level; use dedicated automation PAT.
- Be deterministic and avoid accidental deletion when payloads are incomplete.

## Goals / Non-Goals

**Goals:**

- Delete issues that are no longer attached to the target project after removal event processing.
- Prevent false-positive deletion when an issue is still present in the project.
- Keep behavior repository-agnostic through node IDs.
- Emit concise action summaries for operations and audits.

**Non-Goals:**

- No soft-close fallback in this workflow.
- No retroactive bulk purge of historical orphan issues.
- No project field migration or archival behavior changes.

## Decisions

1. Use `repository_dispatch` as trigger integration boundary.

- Rationale: existing project automations already consume dispatch events in this repository architecture.

2. Perform membership verification before deletion.

- Query issue `projectItems` and confirm issue is absent from target `project_id`.
- Rationale: avoids destructive action from malformed payload or delayed event ordering.

3. Hard-delete with GraphQL `deleteIssue(issueId)`.

- Rationale: explicit requirement is deletion, not closure.

4. Keep dry-run capability.

- Rationale: supports safe pilot validation in production-like conditions.

5. Skip non-issue node types.

- Rationale: project items may represent draft issues or pull requests; only issue nodes are in scope.

## Risks / Trade-offs

- [Irreversible deletion] Data cannot be recovered from issue history once deleted.
  - Mitigation: manual `workflow_dispatch` defaults to `dry_run: true`; event path still deletes by default.

- [Out-of-order events] Dispatch may arrive before project state converges.
  - Mitigation: runtime verification that issue is not in target project before deletion.

- [Permission failures] PAT may lack delete rights in some repositories.
  - Mitigation: fail with explicit mutation error in logs and summary.

## Migration Plan

1. Add reusable workflow in org `.github` repo.
2. Add thin trigger workflow and matching org template artifacts.
3. Pilot with `dry_run` dispatch events, then enable delete path.
4. Roll out template to participating repositories.

Rollback:

- Disable/remove thin trigger workflows from consuming repositories.
- Retain reusable engine unreferenced, or revert this change.

## Open Questions

- Should a separate scheduled reconciler be added later to remove pre-existing orphan issues?
- Should deletion be blocked for issues carrying protected labels (e.g., `legal-hold`)?
