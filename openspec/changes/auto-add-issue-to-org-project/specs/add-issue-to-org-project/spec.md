## ADDED Requirements

### Requirement: Add newly opened issues to the main org project in real time
The system SHALL add any open, non-pull-request issue opened in a repository carrying the trigger workflow to the main org project (`PVT_kwDOCIcusc4BOGrD`) via the `addProjectV2ItemById` mutation, within the same Actions run as the `issues: opened` event. No scheduled polling or scan SHALL be used.

#### Scenario: Issue opened in a repo with the trigger workflow
- **WHEN** an `issues: opened` event fires in a repository that has the `add-issue-to-org-project` trigger workflow
- **THEN** the workflow adds the issue to the main org project within that same run, with no polling delay

#### Scenario: Pull requests are not added
- **WHEN** the workflow-relevant event concerns a pull request rather than an issue
- **THEN** the system SHALL NOT attempt to add it to the project (the `issues` event trigger does not fire for pull requests, so no additional filtering is required)

### Requirement: Idempotent project membership
The system SHALL NOT create duplicate project items for an issue that is already a member of the main org project.

#### Scenario: Issue already in the project
- **WHEN** the add workflow runs against an issue that is already a project item
- **THEN** the mutation returns the existing item without creating a second item, and the run reports status as already-present rather than added

### Requirement: Dry-run support
The reusable add-to-project workflow SHALL support a `dry_run` input that validates and reports the intended action without calling the mutation.

#### Scenario: Dry-run invocation
- **WHEN** the workflow is invoked with `dry_run: true`
- **THEN** the system logs and summarizes what would have been added but does not call `addProjectV2ItemById`

### Requirement: Manual invocation
The reusable add action SHALL support manual `workflow_dispatch` invocation for a specific issue, with an optional `debug` input for verbose logging.

#### Scenario: Manual add of a single issue
- **WHEN** a user triggers the reusable workflow via `workflow_dispatch` with an issue node ID
- **THEN** the system attempts to add that specific issue to the project and reports the outcome

### Requirement: Org-wide distribution
The trigger workflow SHALL be published as an org workflow template and rolled out to existing repositories in the org, so coverage is real across the org rather than limited to a single repository.

#### Scenario: Repo without the trigger adopts it via template
- **WHEN** a repo maintainer opens the Actions "New workflow" picker in any org repo
- **THEN** the `add-issue-to-org-project` template is available and, once added, wires that repo into the same central reusable action
