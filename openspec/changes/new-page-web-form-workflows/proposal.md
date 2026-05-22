## Why

The team needs a single, consistent intake path for "Nouvelle Page Web" requests and automatic execution scaffolding after submission. Today, request capture and issue orchestration are partially manual, which creates inconsistencies in naming, dependency order, and kickoff governance.

## What Changes

- Add a dedicated issue form for "Nouvelle Page Web" with normalized fields (site, page type, name, optional description, priority, conditional booleans).
- Add workflow automation that creates the parent issue and all required subissues with deterministic naming.
- Add conditional automation for kickoff, template production, and new modules subissues.
- Add dependency wiring rules so kickoff (when enabled) blocks all other subissues, and baseline work order remains enforced.
- Add parent-only priority assignment behavior for this intake flow, while leaving child priority management to a global priority workflow.

## Capabilities

### New Capabilities
- `new-page-web-request-form`: Define the canonical issue form contract and field defaults for page requests.
- `new-page-web-workflow-orchestration`: Define automated parent/subissue creation, conditional branching, and dependency wiring for this flow.

### Modified Capabilities
- None.

## Impact

- Issue forms and templates under `.github/ISSUE_TEMPLATE/`.
- Reusable workflow logic and thin trigger workflows under `.github/workflows/`.
- Organization workflow template artifacts under `.github/workflow-templates/`.
- Automation token usage for issue creation, linking, and dependency operations.
- Validation runbooks and pilot evidence capture for rollout readiness.
