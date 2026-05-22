# OpenSpec Project Context

## Repository Focus

This repository defines reusable organization workflows and matching templates.
Workflow changes may have destructive side effects (for example deleting issues), so validation must be staged and evidence-driven.

## Safe Validation Playbook

1. Create a dedicated validation branch.
2. Commit only the artifacts for the current workflow change.
3. Push branch and validate what is possible before default-branch rollout.
4. If GitHub prevents `workflow_dispatch` before default-branch registration:
   - Run API-equivalent checks (mutation contract, guard conditions, final state checks).
   - Then run full workflow validation immediately after pushing to default branch.
5. For destructive workflows, always execute:
   - Skip scenario: target still in scope, destructive action must not run.
   - Execute scenario: target out of scope, destructive action must run.
6. Collect proof for each scenario:
   - Workflow run ID
   - Run conclusion
   - Log proof line confirming behavior
   - Final resource state from API/CLI
7. Use deterministic output capture (`GH_PAGER=cat`) and short commands if terminal buffering is unstable.
8. Check token scopes early. If required scope is missing, document the limitation and complete full validation with proper credentials after rollout.
9. Clean up temporary issues/items and record cleanup evidence.

## Required Evidence Checklist

- Commit range and pushed ref
- Runtime runs with IDs and conclusions
- One proof line for skip behavior
- One proof line for destructive behavior
- Final API/CLI verification of target state
- Cleanup confirmation for temporary test artifacts
