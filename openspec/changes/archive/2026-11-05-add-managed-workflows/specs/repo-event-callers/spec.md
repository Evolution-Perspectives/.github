## Purpose

Make the org's issue automations react instantly in every repository by giving each repo a thin, versioned caller that delegates all logic to the reusable workflows in `.github`.

## ADDED Requirements

### Requirement: Callers contain no logic
Each managed caller SHALL only declare its trigger and call a reusable workflow in `Evolution-Perspectives/.github` with inputs derived from the event and the automation secret. It MUST NOT contain business logic, so logic changes in `.github` apply to all repos without redeploying callers.

#### Scenario: Logic change does not need a redeploy
- **WHEN** a reusable workflow in `.github` changes and the `v1` tag is moved
- **THEN** every repo uses the new logic on its next event with no change to the repo

### Requirement: Supported callers
The system SHALL provide callers for: issue opened (add the issue to the org project), issue closed (set Status from the close reason), and issue closed (remove the closed issue's blocking relationships).

#### Scenario: Issue closed in a product repo
- **WHEN** an issue is closed in a repo with the managed callers
- **THEN** its project Status is set from the close reason and the issues it blocked are unblocked

#### Scenario: Issue opened in a product repo
- **WHEN** an issue is opened in a repo with the managed callers
- **THEN** it is added to the org project with Status `📦 Backlog`

### Requirement: Version pinning
Managed callers SHALL reference reusable workflows by a version tag (`v1`) by default. A repo MAY follow a different ref through the manifest, to act as a pilot.

#### Scenario: Pilot on a candidate ref
- **WHEN** the manifest sets a repo's ref to a candidate ref
- **THEN** that repo's callers use that ref while all others stay on `v1`

### Requirement: Managed marker and namespace
Every managed file SHALL be named `org-<name>.yml` under `.github/workflows/` and begin with a header stating it is managed and must not be edited by hand.

#### Scenario: Header present
- **WHEN** a caller is deployed
- **THEN** its first lines contain the managed header with the source path in `.github`

### Requirement: Manual runs
Each caller SHALL support `workflow_dispatch` with the same dry-run and debug inputs as the existing triggers, for repair and backfill.

#### Scenario: Manual dry-run
- **WHEN** a maintainer dispatches a caller with dry-run on
- **THEN** the reusable workflow validates and reports without writing

### Requirement: Callers are event-driven only
Managed callers SHALL NOT expose `workflow_dispatch` or any input, because they run with the org token in every repository and a manual input could point that token at another issue, repository or project.

#### Scenario: No manual trigger
- **WHEN** a managed caller template is inspected
- **THEN** it declares only its issue event trigger, no `workflow_dispatch` and no `inputs.` reference

