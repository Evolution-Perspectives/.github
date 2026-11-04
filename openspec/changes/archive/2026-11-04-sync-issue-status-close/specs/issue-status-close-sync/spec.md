## Purpose

Keeps an issue's open or closed state and its Project Status field consistent in both directions, without feedback loops.

## ADDED Requirements

### Requirement: Closing an issue sets Project Status
When an issue tracked on the main org Project is closed, the system SHALL update its Project Status field to reflect the close reason.

#### Scenario: Closed as completed
- **WHEN** an issue is closed with `state_reason: completed`
- **THEN** the system sets the issue's Project Status to `🏆 Done`

#### Scenario: Closed as not planned
- **WHEN** an issue is closed with `state_reason: not_planned`
- **THEN** the system sets the issue's Project Status to `❌ Canceled`

#### Scenario: Closed as duplicate
- **WHEN** an issue is closed with `state_reason: duplicate`
- **THEN** the system sets the issue's Project Status to `❌ Canceled`

#### Scenario: Status already matches
- **WHEN** an issue is closed and its Project Status already equals the target option for that close reason
- **THEN** the system SHALL NOT issue a Project field-update mutation

### Requirement: Setting Status to Done or Canceled closes the issue
When a Project item's Status field is set to `🏆 Done` or `❌ Canceled`, the system SHALL close the linked issue with the corresponding close reason.

#### Scenario: Status set to Done
- **WHEN** a Project item's Status is set to `🏆 Done`
- **THEN** the system closes the linked issue with `state_reason: completed`

#### Scenario: Status set to Canceled
- **WHEN** a Project item's Status is set to `❌ Canceled`
- **THEN** the system closes the linked issue with `state_reason: not_planned`

#### Scenario: Issue already closed with the matching reason
- **WHEN** a Project item's Status is set to `🏆 Done` or `❌ Canceled` and the linked issue is already closed with the corresponding `state_reason`
- **THEN** the system SHALL NOT issue an issue-close mutation

### Requirement: Moving a closed issue's Status off Done/Canceled reopens it
When a Project item linked to a currently-closed issue has its Status set to any option other than `🏆 Done` or `❌ Canceled`, the system SHALL reopen the linked issue.

#### Scenario: Status moved back to an active option
- **WHEN** a closed issue's Project item Status is changed to `📦 Backlog`, `💎 Ready`, `🌱 In Progress`, `⏳ Paused`, or `🧪 In Review`
- **THEN** the system reopens the issue

#### Scenario: Issue already open
- **WHEN** a Project item's Status is set to a non-Done/Canceled option and the linked issue is already open
- **THEN** the system SHALL NOT issue a reopen mutation

### Requirement: Draft or non-issue Project items are ignored
The Status-to-close/reopen sync SHALL only act on Project items linked to a GitHub issue.

#### Scenario: Draft item Status changed
- **WHEN** a Project item's Status changes and the item has no linked issue (a draft item, or a linked pull request)
- **THEN** the system takes no close/reopen action for that item

### Requirement: Pending Release closes the issue and is not overwritten
The system SHALL treat `📤 Pending Release` as a state where the team's work is finished: the linked issue is closed as completed, and a later close event SHALL NOT overwrite the Status.

#### Scenario: Status set to Pending Release
- **WHEN** an open issue's Project Status is set to `📤 Pending Release`
- **THEN** the system closes the issue as `completed`

#### Scenario: Issue already closed
- **WHEN** a closed issue's Project Status is set to `📤 Pending Release`
- **THEN** the system makes no change, whatever the close reason

#### Scenario: Closed from In Review
- **WHEN** an issue whose Status is `🧪 In Review` is closed as completed
- **THEN** the system sets its Status to `📤 Pending Release`

#### Scenario: Closed while Pending Release
- **WHEN** an issue whose Status is `📤 Pending Release` is closed as completed
- **THEN** the system keeps the Status unchanged

#### Scenario: Pending Deploy stays open
- **WHEN** a closed issue's Project Status is set to `📡 Pending Deploy`
- **THEN** the system reopens the issue


### Requirement: Status field and options are resolved live by name

The system SHALL resolve the Status field and the Done, Canceled and Pending Release options by name from the live project and SHALL NOT embed field or option IDs. A missing option SHALL fail the run before any write.

#### Scenario: Options renumbered in the project

- **WHEN** the project's Status option IDs differ from any previously seen values
- **THEN** the system uses the IDs returned by the live project

#### Scenario: Option missing

- **WHEN** the project has no option named for the target Status
- **THEN** the run fails and issues no mutation

### Requirement: Both directions support dry-run

Each direction SHALL support a `dry_run` input that validates and summarizes without issuing any mutation.

#### Scenario: Dry-run close from Status

- **WHEN** a Status change would close the issue and `dry_run` is true
- **THEN** no close mutation is issued

#### Scenario: Dry-run Status from close

- **WHEN** an issue close would set a Status and `dry_run` is true
- **THEN** no field-update mutation is issued
