## Context

The organization uses native GitHub issue dependency relationships (`blockedBy` / `blocking`) to represent delivery constraints. Today, when a blocking issue is closed, the outgoing dependency links can remain, producing stale blockers and misleading dependency summaries.

Automation already follows an org pattern: centralized logic in the `.github` repository and thin per-repo issue triggers. This change should fit that pattern and avoid introducing repository-specific behavior.

Constraints:

- Run on all issue close reasons (not only completed).
- Prefer native GraphQL relationships over labels/body parsing.
- Keep behavior deterministic and idempotent.
- Use org-managed secrets and minimum required permissions.

Stakeholders:

- Engineering managers relying on issue dependency views.
- Developers triaging blocked work.
- Repository maintainers consuming shared workflow templates.

## Goals / Non-Goals

**Goals:**

- Remove all outgoing `blocking` relationships from a closed issue using first-party GraphQL mutation `removeBlockedBy`.
- Support many blocked issues per blocker (batch processing in one workflow run).
- Provide clear run logs and per-edge failure reporting.
- Work with same-repo and potential cross-repo issue links without special-case logic.

**Non-Goals:**

- No automatic status, label, assignee, or project field updates on unblocked issues.
- No comment notifications as part of this change.
- No remediation of historical stale relationships in bulk (only event-driven on close).

## Decisions

1. Trigger on `issues.closed` regardless of reason.

- Rationale: user intent is to end dependency edge whenever blocker is closed, independent of close semantics.
- Alternative considered: filter to `state_reason = completed`; rejected because it conflicts with explicit requirement.

2. Use native GraphQL dependency fields and mutation.

- Choice: query closed issue `blocking` list and call `removeBlockedBy(issueId, blockingIssueId)` per target.
- Rationale: robust, first-class API, avoids brittle text conventions.
- Alternative considered: infer from issue body keywords or labels; rejected due ambiguity and maintenance risk.

3. Centralize logic in reusable workflow and distribute thin triggers.

- Rationale: one implementation source, easier maintenance, consistent org behavior.
- Alternative considered: full workflow copy in each repo; rejected due duplication and drift.

4. Continue processing when one edge removal fails.

- Rationale: partial cleanup is better than all-or-nothing; failures are surfaced in summary for retry.
- Alternative considered: fail fast; rejected because one malformed/permission edge would block unrelated cleanup.

5. Use PAT secret (org-level) for GraphQL mutation.

- Rationale: default `GITHUB_TOKEN` is insufficient for these mutations in this setup; PAT offers required scopes and cross-repo consistency.
- Alternative considered: only `GITHUB_TOKEN`; rejected due permission limitations and repo boundary concerns.

## Risks / Trade-offs

- [Token over-permission] PAT could be broader than needed -> Mitigation: create dedicated bot PAT, minimal scopes, store as org secret with selected-repo visibility.
- [API pagination gap] Very high number of blocked issues may exceed first page -> Mitigation: implement pagination loop on `blocking` connection.
- [Runtime failures on individual edges] Missing access to one target issue could fail a mutation -> Mitigation: per-edge try/catch and final job summary of failed removals.
- [Automation visibility] Silent success may reduce confidence -> Mitigation: add concise workflow summary with counts: discovered, removed, failed.

## Migration Plan

1. Create org-level PAT and secret for workflow consumption.
2. Add reusable workflow in org `.github` repository.
3. Add/roll out thin trigger workflow template to participating repositories.
4. Validate in one pilot repo with test dependency pair.
5. Expand to remaining repos and monitor for one sprint.

Rollback:

- Disable or remove thin trigger workflows in repositories.
- Keep reusable workflow file but unreferenced, or revert workflow commit.

## Open Questions

- Should there be an optional dry-run mode for validation in early rollout?
- Should failed edge removals open an issue or only appear in Actions summary?
- Do we want a periodic audit workflow later to clean historical stale links not touched by close events?
