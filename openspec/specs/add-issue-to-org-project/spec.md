# add-issue-to-org-project Specification

## Purpose
Adds every newly opened issue to the main org project in real time through a reusable engine that any repository can call, so the planning board stays complete without polling.

## Requirements

### Requirement: Add newly opened issues to the org project in real time
The system SHALL add an issue opened in a repository carrying the caller workflow to the org project given by the caller's `project_id` input, via `addProjectV2ItemById`, within the same Actions run as the `issues: opened` event. No scheduled polling or scan SHALL be used.

#### Scenario: Issue opened in a repo with the caller workflow
- **WHEN** an `issues: opened` event fires in a repository that has the caller workflow
- **THEN** the engine adds the issue to the project within that same run, with no polling delay

#### Scenario: Pull requests are not added
- **WHEN** the event concerns a pull request rather than an issue
- **THEN** the system SHALL NOT add it (the `issues` trigger does not fire for pull requests)

### Requirement: Idempotent project membership
The system SHALL NOT create duplicate project items for an issue that is already a member of the project.

#### Scenario: Issue already in the project
- **WHEN** the engine runs against an issue that is already a project item
- **THEN** no mutation is issued and the run reports `already-present`

### Requirement: Optional initial Status resolved live
When the caller passes `status_name`, the system SHALL set that Status on the newly added item, resolving the Status field and option by name from the live project, and SHALL NOT embed field or option IDs.

#### Scenario: Status given and present
- **WHEN** `status_name` matches a Status option of the project
- **THEN** the item is added and its Status is set to that option

#### Scenario: Status name unknown
- **WHEN** `status_name` matches no Status option
- **THEN** the run fails before the add mutation and nothing is written

### Requirement: Dry-run support
The engine SHALL support a `dry_run` input that validates and reports the intended action without calling any mutation.

#### Scenario: Dry-run invocation
- **WHEN** the engine is called with `dry_run: true`
- **THEN** the run reports `dry-run` and calls neither `addProjectV2ItemById` nor the Status mutation

### Requirement: Callable from any repository
The engine SHALL be a `workflow_call` reusable workflow with typed inputs and an `automation_pat` secret so any repository can call it by full path and ref.

#### Scenario: Another repo calls the engine
- **WHEN** a repository's caller workflow invokes the engine with `project_id` and `issue_node_id`
- **THEN** the engine runs with that repository's event data and adds the issue to the project

#### Scenario: Malformed node ID
- **WHEN** `issue_node_id` or `project_id` does not match the node ID shape
- **THEN** the run fails before any API call
