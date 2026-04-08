## ADDED Requirements

### Requirement: Closed issue dependencies SHALL be cleaned up

The system SHALL, when an issue is closed for any reason, discover all issues that are currently blocked by the closed issue and remove each corresponding native GitHub dependency relationship.

#### Scenario: Closed issue with one blocked issue

- **WHEN** issue A is closed and issue A is blocking issue B
- **THEN** the automation removes the dependency edge where issue B is blocked by issue A

#### Scenario: Close reason is not completed

- **WHEN** issue A is closed with reason `NOT_PLANNED` or `DUPLICATE` and issue A is blocking issue B
- **THEN** the automation removes the dependency edge where issue B is blocked by issue A

### Requirement: Dependency cleanup SHALL process all outgoing edges

The system SHALL process every outgoing `blocking` relationship of the closed issue in a single run, including multi-target cases.

#### Scenario: Closed issue blocks multiple issues

- **WHEN** issue A is closed and issue A is blocking issues B, C, and D
- **THEN** the automation attempts removal for A->B, A->C, and A->D in that run

#### Scenario: Closed issue has no outgoing blocking relationships

- **WHEN** issue A is closed and issue A blocks no issues
- **THEN** the automation performs no mutation and exits successfully

### Requirement: Cleanup execution SHALL be resilient and observable

The system SHALL continue processing remaining dependency removals when one removal fails, and SHALL emit a run summary of total discovered, removed, and failed edges.

#### Scenario: One edge removal fails

- **WHEN** issue A is closed and one mutation fails while others are valid
- **THEN** the automation continues attempting remaining removals
- **THEN** the run summary reports at least one failure and includes failing edge identifiers

#### Scenario: All edge removals succeed

- **WHEN** issue A is closed and all dependency removal mutations succeed
- **THEN** the run summary reports discovered count equals removed count and failed count equals zero

### Requirement: Workflow SHALL support repository-agnostic targets

The cleanup logic SHALL remove dependency edges by issue node IDs and SHALL NOT depend on closed issue and blocked issue being in the same repository.

#### Scenario: Same-repository dependency

- **WHEN** issue A and issue B are in the same repository and A blocks B
- **THEN** the automation removes the dependency edge using issue node IDs

#### Scenario: Cross-repository dependency

- **WHEN** issue A and issue B are in different repositories and A blocks B
- **THEN** the automation removes the dependency edge using issue node IDs without repository-specific branching
