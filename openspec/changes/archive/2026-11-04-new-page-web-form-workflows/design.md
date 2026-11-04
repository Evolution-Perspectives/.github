## Context

The organization needs a repeatable request intake and issue orchestration flow for "Nouvelle Page Web" requests. The desired operating model combines a structured issue form with automation that creates a parent issue, creates deterministic subissues, and wires dependencies consistently.

This change touches multiple workflow artifacts and requires organization-safe rollout practices because automation can create and mutate issue relationships at scale.

Constraints:
- Keep reusable workflow architecture with thin trigger and matching template artifacts.
- Keep parent priority assignment local to this flow and leave child priority governance to the global priority workflow.
- Support optional kickoff gating that can block all downstream subissues.
- Keep deterministic naming and dependency behavior for operational clarity.

Stakeholders:
- Request submitters creating new page initiatives
- Delivery teams consuming subissue plans
- Direction/management when kickoff gating is enabled
- Platform maintainers responsible for organization workflow reliability

## Goals / Non-Goals

**Goals:**
- Define a canonical request form contract for new page work.
- Define deterministic workflow behavior for parent and subissue creation.
- Define conditional branch behavior for kickoff, template, and new modules paths.
- Define dependency wiring so kickoff (when present) blocks all other subissues.
- Define safe rollout and validation sequencing for organization adoption.

**Non-Goals:**
- Implement child priority propagation logic in this flow.
- Replace the separate global priority workflow.
- Introduce non-GitHub external orchestration components.

## Decisions

1. Keep one parent intake form and one orchestration workflow capability.
- Rationale: minimizes split-brain behavior and keeps request-to-delivery path understandable.
- Alternative considered: separate workflows for each conditional subissue type. Rejected due to orchestration drift risk.

2. Apply priority only to the parent in this flow.
- Rationale: avoids dual ownership with the global child-priority workflow.
- Alternative considered: set child priority during creation. Rejected to prevent conflicts and race conditions.

3. Add optional kickoff gate via boolean form field defaulting to false.
- Rationale: supports governance-heavy launches without forcing overhead on normal requests.
- Alternative considered: always require kickoff. Rejected because it would slow low-risk throughput.

4. Use dependency-first orchestration semantics.
- Rationale: kickoff and ordered dependencies enforce execution readiness and reduce premature integration work.
- Alternative considered: create all tasks without dependencies. Rejected due to weak execution guidance.

5. Validate with branch-first evidence collection.
- Rationale: preserves safety for workflow rollout and aligns with repository safe-validation protocol.
- Alternative considered: direct default-branch rollout without pilot evidence. Rejected due to avoidable rollout risk.

## Risks / Trade-offs

- [Kickoff bottleneck] Optional kickoff may become an unintended gate if selected too often -> Mitigation: keep default false and define clear kickoff completion criteria.
- [Workflow race conditions] Multiple runs can create duplicate links or inconsistent dependency state -> Mitigation: enforce idempotent checks before create/link operations.
- [Permission gaps] Tokens may lack required scopes for issue linking operations -> Mitigation: document required scopes and include pre-validation checks.
- [Behavior drift over time] Form fields and workflow assumptions can diverge -> Mitigation: treat form contract as capability spec and validate template/runtime parity.

## Migration Plan

1. Introduce the new form contract and workflow artifacts in a dedicated change.
2. Validate in feature branch first with pilot requests and deterministic evidence capture.
3. If default-branch registration is required for complete workflow_dispatch behavior, run API-equivalent prechecks before merge, then complete full workflow validation immediately after push to default branch.
4. Capture run IDs, conclusions, key proof lines, and post-run state verification.
5. Roll out to organization template consumers after pilot acceptance.

Rollback:
- Disable thin trigger in consuming repositories.
- Revert reusable workflow and template references in a single rollback change.

Validation cleanup plan:
- Remove temporary validation issues/subissues created during pilot tests.
- Record cleanup evidence (created IDs and post-cleanup verification).

## Open Questions

- Should kickoff become auto-required for specific priority levels, or remain strictly user-selected?
- Should kickoff include an SLA field in the future to avoid long blocking windows?
- Should dependency wiring support partial unblock patterns, or remain all-or-nothing when kickoff is present?
