## 1. Contract And Configuration

- [x] 1.1 Define workflow_call inputs and required secrets for project field IDs, capacity configuration, strict-mode behavior, and reconciliation scope
- [x] 1.2 Add early input validation and clear failure messages for missing or invalid configuration
- [x] 1.3 Define common run metadata contract (correlation identifier, summary counters, and status fields)

## 2. Rollup Computation Engine

- [x] 2.1 Implement hierarchy traversal that computes effective hours using bottom-up post-order semantics
- [x] 2.2 Implement leaf-editable and parent-derived estimate rules, including parent manual-override suppression when children exist
- [x] 2.3 Implement serialized single-writer processing per hierarchy root with idempotent write behavior
- [x] 2.4 Add event-branch recompute path for estimate and hierarchy update signals

## 3. Forecast Date Automation

- [x] 3.1 Implement forecast-date calculation from rolled-up remaining hours and working-day capacity calendar
- [x] 3.2 Implement strict-mode incomplete forecast handling when descendant estimates are missing
- [x] 3.3 Implement calendar exception handling for weekends and configured non-working dates

## 4. Reconciliation And Resilience

- [x] 4.1 Implement scheduled full reconciliation to recompute tracked hierarchies and repair drift
- [x] 4.2 Implement partial-failure continuation behavior and aggregate failure reporting when fail-fast is disabled
- [x] 4.3 Implement replay-safe retry behavior so reruns with unchanged source data are idempotent

## 5. Workflow Packaging For Organization Reuse

- [x] 5.1 Add reusable workflow engine in .github/workflows with least-privilege permissions and summary outputs
- [x] 5.2 Add thin trigger workflow in .github/workflows that only wires events/schedule and forwards parameters to reusable workflow
- [x] 5.3 Add matching organization workflow template YAML in .github/workflow-templates that mirrors trigger contract semantics
- [x] 5.4 Add matching template metadata JSON in .github/workflow-templates with discoverable name and description
- [x] 5.5 Validate reference integrity across reusable workflow, trigger workflow, and template artifacts

## 6. Validation And Rollout

- [x] 6.1 Add or update tests for single-item success, multi-item success, no-op, and partial-failure continuation paths
- [x] 6.2 Validate template-generated workflow path in a pilot repository and capture outcome evidence
- [x] 6.3 Document rollout and rollback runbook steps, including replay diagnostics and reconciliation controls
- [x] 6.4 Capture pilot summary metrics and readiness decision for organization-wide rollout
