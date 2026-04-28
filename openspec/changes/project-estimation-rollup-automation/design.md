## Context

Planning accuracy is currently degraded by manual estimate and deadline maintenance across issue hierarchies. The organization needs an approach that works for Projects v2 updates, avoids parent-child drift, and remains repository-agnostic for rollout through organization templates. Existing workflow patterns in this repository require a reusable engine, a thin trigger workflow, and matching template artifacts.

## Goals / Non-Goals

**Goals:**
- Compute parent estimate values as deterministic rollups from leaf work items.
- Derive forecast completion dates from rolled-up remaining hours and capacity settings.
- Process incremental updates quickly while preserving correctness under concurrent change activity.
- Provide scheduled drift reconciliation and clear operational observability.
- Fit organization workflow architecture and template constraints for broad reuse.

**Non-Goals:**
- Replacing project-management policy decisions such as who owns estimate quality.
- Building custom project board UI components.
- Enabling manual parent override while children exist.
- Introducing repository-specific business logic in the reusable engine.

## Decisions

### 1. Event bridge and execution model
Use Projects v2 webhook events as the source signal and route into GitHub Actions through a controlled dispatch contract. Trigger workflows remain thin and only forward context and secrets to the reusable engine.

Alternatives considered:
- Direct Actions event trigger for Projects v2 item changes: rejected because this event path is not available as a first-class Actions trigger.
- Poll-only schedule: rejected due to high latency and unnecessary full scans.

### 2. Canonical estimation unit
Store canonical values in hours. Optional day values are derived display fields and never the source of truth.

Alternatives considered:
- Days as canonical: rejected because capacity-based forecasting requires conversion assumptions that vary by team.
- Dual canonical units: rejected due to drift risk.

### 3. Rollup algorithm semantics
Use bottom-up post-order traversal from deepest descendants to root. Leaves are manually editable; any node with children is computed as the sum of child effective hours.

Alternatives considered:
- Top-down allocation: rejected because it conflicts with child-first planning and introduces unstable redistribution.
- Parent override plus child sums: rejected due to ambiguity and reconciliation complexity.

### 4. Write serialization and idempotency
Adopt single-writer semantics per hierarchy root and idempotent upserts for field writes. Updates use deterministic snapshots and include correlation identifiers.

Alternatives considered:
- Parallel writes per changed node: rejected due to race conditions and clobber risk.
- Last-write-wins without version checks: rejected because stale computations can overwrite correct values.

### 5. Hybrid reconciliation strategy
Run event-driven branch recompute on updates and nightly full recompute for drift repair. Nightly runs are valid no-op successes when no differences are detected.

Alternatives considered:
- Event-only: rejected because transient failures can leave persistent drift.
- Nightly-only: rejected due to poor responsiveness.

### 6. Capacity and forecast policy
Forecast date uses remaining effective hours divided by configured capacity calendar, skipping non-working days. If any required child estimate is unknown, parent forecast enters an incomplete state rather than publishing misleading certainty.

Alternatives considered:
- Treat missing estimates as zero: rejected because it hides planning gaps.
- Block all rollups on any missing estimate globally: rejected because it prevents partial progress visibility.

## Risks / Trade-offs

- [Webhook delivery gaps or replay windows] -> Mitigation: nightly reconciliation and replay-safe idempotent writes.
- [Large hierarchy recompute cost] -> Mitigation: incremental branch recompute on events and bounded traversal with pagination.
- [Policy disagreement on missing estimates] -> Mitigation: configurable strict/lenient mode with explicit default documented in template.
- [Permission scope creep] -> Mitigation: least-privilege permissions and dedicated org secrets for automation identity.
- [Template/runtime drift across artifacts] -> Mitigation: contract checks in validation tasks and rollout gate.

## Migration Plan

1. Add new OpenSpec specs and tasks for rollup, forecast, and reconciliation capabilities.
2. Implement reusable workflow engine with explicit input/secret contract and early validation.
3. Add thin trigger workflow(s) and matching organization template YAML/metadata JSON.
4. Introduce pilot rollout on a controlled subset of boards and validate success/no-op/partial-failure paths.
5. Enable organization-wide rollout after pilot metrics and template path validation pass.
6. Rollback strategy: disable trigger workflow and schedule; rerun last successful reconciliation in read-only mode for verification.

## Open Questions

- Which project fields are canonical for estimate hours and remaining hours across all target boards?
- Should incomplete parent forecasts show blank, explicit status text, or retained prior value with warning?
- What maximum hierarchy depth should be supported before hard-fail safeguards engage?
- Which organization team owns capacity calendar governance and exception handling?
