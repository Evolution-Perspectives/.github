# issue-dependency-cleanup Specification

## Purpose
Removes the native GitHub dependency links of an issue when it closes, in both directions, so no open issue stays blocked by a closed one and a closed issue carries no stale dependency.

## Requirements

### Requirement: Closed issue dependencies SHALL be cleaned up in both directions

The system SHALL, when an issue is closed for any reason, remove every dependency link where it blocks another issue and every dependency link where another issue blocks it.

#### Scenario: Closed issue blocks one issue

- **WHEN** issue A is closed and issue A is blocking issue B
- **THEN** the automation removes the link where B is blocked by A

#### Scenario: Closed issue is blocked by another issue

- **WHEN** issue A is closed and issue C is blocking issue A
- **THEN** the automation removes the link where A is blocked by C

#### Scenario: Close reason is not completed

- **WHEN** issue A is closed with reason `NOT_PLANNED` or `DUPLICATE`
- **THEN** the automation removes both its blocking and blocked-by links

### Requirement: Dependency cleanup SHALL process every edge

The system SHALL read every page of both relationship lists and process every discovered link in a single run.

#### Scenario: Closed issue has many links

- **WHEN** issue A is closed, blocks B, C and D, and is blocked by E
- **THEN** the automation attempts removal for A->B, A->C, A->D and E->A in that run

#### Scenario: Closed issue has no links

- **WHEN** issue A is closed and has no blocking or blocked-by links
- **THEN** the automation performs no mutation and exits successfully

### Requirement: Cleanup execution SHALL be resilient and observable

The system SHALL continue processing remaining removals when one fails, and SHALL emit a run summary of discovered, removed and failed links.

#### Scenario: One link removal fails

- **WHEN** issue A is closed and one mutation fails while others are valid
- **THEN** the automation continues with the remaining removals
- **THEN** the run summary reports the failure and identifies the failing link

#### Scenario: All removals succeed

- **WHEN** all removal mutations succeed
- **THEN** the run summary reports discovered equal to removed and failed equal to zero

### Requirement: Cleanup SHALL support dry-run

The system SHALL support a `dry_run` input that lists the links it would remove without removing any.

#### Scenario: Dry-run

- **WHEN** the engine is called with `dry_run: true` for an issue that has links
- **THEN** each link is logged as `[dry-run] Would remove edge` and no mutation is issued

### Requirement: Cleanup SHALL be repository-agnostic and input-safe

The system SHALL remove links by issue node IDs regardless of repository, and SHALL reject malformed `issue_node_id` or `source_repository` inputs before any API call.

#### Scenario: Cross-repository link

- **WHEN** issue A and issue B are in different repositories and A blocks B
- **THEN** the automation removes the link using node IDs without repository-specific branching

#### Scenario: Malformed input

- **WHEN** `issue_node_id` contains characters outside the node ID shape
- **THEN** the run fails before any GraphQL call
