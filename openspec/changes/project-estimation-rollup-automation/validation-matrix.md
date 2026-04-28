## Validation Matrix

### Automated Tests

Run:

```bash
node --test .github/scripts/projects-rollup.test.js
pwsh .github/scripts/validate-rollup-references.ps1
```

Covered scenarios:

- Single-item success path: leaf estimate remains unchanged.
- Multi-item success path: bottom-up sum from descendants to root.
- Partial-failure continuation path: handler continues when fail-fast is disabled.
- Forecast calendar behavior: weekends and configured non-working dates are skipped.

### Manual Validation Steps

1. No-op path
- Trigger a run where parent fields already match computed values.
- Confirm workflow summary reports `Items changed: 0` and successful completion.

2. Partial-failure path
- Trigger with an intentionally invalid field ID in dispatch payload while `fail_fast=false`.
- Confirm one root is recorded as failed and other roots still process.

3. Template-generated path
- Create a pilot repository workflow from template `projects-estimation-rollup.yml`.
- Trigger a dry run and verify reusable workflow invocation and summary metrics.

### Pilot Evidence (This Repository)

- Pilot repository: `Evolution-Perspectives/.github`
- Date: 2026-04-28
- Local validation command: `node --test .github/scripts/projects-rollup.test.js`
- Local validation result: 5 passed, 0 failed, duration 220.9571 ms
- Contract integrity command: `pwsh .github/scripts/validate-rollup-references.ps1`
- Contract integrity result: passed (`Reference integrity validated for projects-estimation-rollup artifacts.`)
- Temporary test issues created: `#3`, `#4` (titles prefixed with `tmp-rollup-delete-check`)
- Cleanup method: GraphQL `deleteIssue` mutation
- Cleanup verification: `gh issue list --state all --search "tmp-rollup-delete-check in:title"` returned no matches

### Workflow Execution Note

- Remote workflow execution succeeded after pushing workflow files to `main`.
- Workflow: `Projects Estimation Rollup Validation`
- Run ID: `25047577545`
- Trigger: `workflow_dispatch`
- Conclusion: `success`
- Created at: `2026-04-28T10:26:11Z`
- Updated at: `2026-04-28T10:26:26Z`
- Run URL: https://github.com/Evolution-Perspectives/.github/actions/runs/25047577545

### Readiness Decision

- Status: Go
- Decision: Validation requirements are satisfied for this repository pilot and change is ready for archive/rollout progression.
