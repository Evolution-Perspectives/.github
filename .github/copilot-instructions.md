# Copilot Instructions for Organization Workflows

## Mission

This repository is the organization source of truth for reusable GitHub workflow automation.
Every workflow must be designed for organization-wide reuse, with first-class support for centralized issue and pull request operations.

## Mandatory 4-Artifact Set

A workflow change is complete only when all artifacts below are present and aligned:

1. Reusable workflow engine in `.github/workflows/`
2. Thin trigger workflow in `.github/workflows/`
3. Organization workflow template YAML in `.github/workflow-templates/`
4. Organization workflow template metadata JSON in `.github/workflow-templates/`

No exception: template artifacts are required for every workflow.

## Architecture Rules

1. Use a strict split of responsibilities:
   - Trigger workflow handles only event wiring and parameter forwarding.
   - Reusable workflow handles all business logic.
   - Template reflects the trigger usage pattern for downstream repositories.
2. Keep trigger workflows thin:
   - Declare event trigger.
   - Call reusable workflow with `jobs.<job>.uses`.
   - Pass required inputs and secrets only.
   - Do not embed business logic in trigger workflows.
3. Define explicit reusable contracts:
   - Expose `workflow_call` with typed inputs and required secrets.
   - Validate required inputs early and fail with clear errors.
   - Provide safe defaults for optional inputs.

## Template Is Mandatory and Must Match Runtime

1. Template YAML must reference an existing reusable workflow target.
2. Trigger workflow and template must use the same contract semantics:
   - Same required inputs.
   - Same required secrets.
   - Same optional flags behavior.
3. Any rename of reusable workflow files must update:
   - Trigger workflow references.
   - Template YAML references.
   - Related docs and OpenSpec artifacts in the same change.

## Security and Permissions

1. Default to least privilege permissions at workflow and job levels.
2. Use dedicated organization secrets for automation identities.
3. Do not broaden token scope without documenting:
   - Why broader scope is necessary.
   - What minimal scope is required.

## Reliability and Behavior

1. Prefer idempotent behavior.
2. For batch processing, continue on per-item failures unless fail-fast is explicitly required.
3. Treat valid no-op states as successful runs.
4. Emit deterministic outputs and summary metrics.

## Observability Standards

1. Logs must include actionable identifiers for diagnostics and manual replay.
2. Every run must publish a concise Actions summary with:
   - Items discovered
   - Items changed
   - Items failed
3. Debug mode may increase verbosity only; it must not alter behavior.

## Organization-Wide Compatibility

1. Design workflow logic to be repository-agnostic.
2. Avoid hardcoded repository-specific assumptions unless explicitly parameterized.
3. Prefer API-native identifiers over text parsing conventions whenever possible.

## Validation and Rollout Gate

Before organization rollout, validate at minimum:

1. Single-item success path
2. Multi-item success path
3. No-op path
4. Partial-failure path with continued processing
5. Template-generated workflow path

A workflow cannot be marked ready if template path validation fails.

## Safe Validation Protocol (Learned)

When validating destructive or high-impact workflow behavior, use this strict sequence:

1. Validate from a dedicated feature branch first.
2. Commit only the artifacts for the current change (no unrelated files).
3. Push the feature branch before any remote workflow checks.
4. If `workflow_dispatch` cannot run because the workflow is not on default branch yet, run API-equivalent pre-checks first (for example GraphQL mutation/path validation), then perform full workflow validation immediately after merge/push to default branch.
5. Execute at least two runtime paths for destructive flows:
   - Skip path (resource still attached/in-scope, no destructive action)
   - Destructive path (resource out-of-scope, action executes)
6. Capture evidence for each path:
   - Workflow run IDs and conclusions
   - Runtime proof lines from logs
   - Final state verification through API/CLI
7. Use deterministic CLI output during evidence capture (`GH_PAGER=cat`) and prefer short, explicit commands over long multiline scripts when terminal buffering is unreliable.
8. Verify auth scopes before test setup. If required write scope is missing (for example project write scope), document the limitation, run the maximum safe subset of tests, then complete full validation post-push with available automation credentials.
9. Clean up temporary validation artifacts and record cleanup evidence.

## OpenSpec Alignment

1. New workflow capabilities must start with OpenSpec change artifacts in `openspec/changes/`.
2. Implementation must match accepted requirements and scenarios.
3. Behavior changes must update relevant proposal, design, tasks, and specs before merge.

## Copilot Operating Behavior for This Repo

When asked to create or modify workflows, Copilot must:

1. Reuse existing workflow architecture patterns from this repository.
2. Produce or update all 4 mandatory artifacts in one coherent change.
3. Check reference integrity across trigger, reusable workflow, and template.
4. Flag and resolve naming drift before proposing completion.
5. Include validation notes for pilot and organization rollout readiness.
