## ADDED Requirements

### Requirement: Project removal SHALL delete the backing issue

The system SHALL delete an issue when the issue-backed project item is removed from the configured project source of truth.

#### Scenario: Removed issue item is deleted

- **WHEN** an event identifies issue A as removed from the configured project
- **AND** issue A is confirmed as no longer attached to that project at execution time
- **THEN** the system deletes issue A using native GitHub API mutation

### Requirement: Deletion SHALL be guarded by project membership verification

Before deletion, the system SHALL verify that the issue is not currently attached to the target project.

#### Scenario: Issue still attached to project

- **WHEN** an event requests deletion for issue A
- **AND** issue A is still attached to the configured project
- **THEN** the system MUST NOT delete issue A
- **AND** the run summary reports a skipped status indicating the issue remains in project

### Requirement: Non-issue and missing-node inputs SHALL not cause destructive side effects

The system SHALL avoid deletion when the target node is not an issue or is already missing.

#### Scenario: Target node is a pull request or draft item

- **WHEN** the input node resolves to a non-issue type
- **THEN** the system performs no deletion and reports a non-issue skip status

#### Scenario: Target issue is already missing

- **WHEN** the input node cannot be resolved because it is already deleted
- **THEN** the system exits successfully without additional mutation attempts

### Requirement: Execution SHALL support dry-run and auditable summaries

The system SHALL support a dry-run mode and SHALL emit deterministic summary output for each run.

#### Scenario: Dry-run execution

- **WHEN** dry-run is enabled for an eligible removed issue
- **THEN** the system reports that deletion would occur
- **AND** the system does not perform issue deletion

#### Scenario: Deletion execution

- **WHEN** dry-run is disabled for an eligible removed issue
- **THEN** the system deletes the issue
- **AND** the summary reports deleted status with issue and project identifiers
