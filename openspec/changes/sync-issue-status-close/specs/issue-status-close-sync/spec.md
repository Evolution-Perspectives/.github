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
