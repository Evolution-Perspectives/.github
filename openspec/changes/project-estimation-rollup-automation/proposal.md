## Why

Teams are maintaining estimate and deadline fields manually across parent and child work items, which causes drift and inconsistent planning data. This change is needed now to make rollups deterministic and organization-wide, so planning views stay accurate without manual reconciliation.

## What Changes

- Add organization-level automation that recalculates parent estimate fields as the sum of descendant estimates from deepest leaf to root.
- Add forecast-date automation that derives projected completion dates from rolled-up remaining hours and configured capacity calendars.
- Add event-driven recalculation for hierarchy and estimate field updates, with serialized writes to prevent concurrent clobbering.
- Add scheduled full reconciliation to detect and repair drift from missed events or partial failures.
- Add observability outputs (items scanned, items updated, items failed, correlation identifiers) for reliable diagnostics and replay.

## Capabilities

### New Capabilities
- `projects-estimation-rollup`: Computes and writes parent estimate values from child trees using bottom-up rollup semantics.
- `projects-forecast-date-automation`: Derives and updates forecast dates from rolled-up remaining hours and capacity inputs.
- `projects-rollup-reconciliation`: Performs scheduled full recomputation and drift repair across tracked project items.

### Modified Capabilities
- None.

## Impact

- New reusable workflow engine under .github/workflows for rollup and forecast processing logic.
- New thin trigger workflow(s) and corresponding workflow templates/metadata under .github/workflow-templates for organization reuse.
- New webhook bridge contract and event handling logic for Projects v2 updates.
- Updates to OpenSpec artifacts, rollout validation scenarios, and operational runbook details for pilot and org-wide rollout.
