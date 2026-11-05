# project-sweep Specification

## Purpose
Keep issue close state, project Status and blocking relationships consistent across every repo tracked by the org project, by periodically reconciling drift that the event-driven sync workflows miss or that happens in repos where they do not run.

## Requirements

### Requirement: Scheduled central run
The sweep SHALL run on a weekly schedule, on Friday early morning, before the team's sprint starts, and on manual dispatch from this repository only. It MUST NOT require any workflow file, secret or setting in the repositories it covers.

#### Scenario: New repo is covered without setup
- **WHEN** an issue from a repo that has no workflows is added to the project
- **THEN** the next sweep reconciles that item like any other

#### Scenario: Manual run
- **WHEN** a maintainer dispatches the sweep manually
- **THEN** the run defaults to dry-run and applies no write unless dry-run is explicitly disabled

### Requirement: Single read of project state
The sweep SHALL read all project items, with issue state, close reason, Status and blocking relationships, once per run, and MUST evaluate every stage against that snapshot updated in memory with the writes already applied.

#### Scenario: Later stage sees earlier stage result
- **WHEN** the close stage closes an issue that blocks other issues
- **THEN** the blocking stage plans the removal of those edges in the same run, without a second read

#### Scenario: Failed write does not cascade
- **WHEN** a write fails for an item
- **THEN** the item keeps its previous state in the snapshot and later stages do not plan work that depends on the write

### Requirement: Open issues follow a closing Status
For an item whose Status is `🏆 Done` or `📤 Pending Release`, the sweep SHALL close an open issue as completed. For `❌ Canceled`, it SHALL close an open issue as not planned. The sweep MUST NOT reopen a closed issue, whatever its Status.

#### Scenario: Open issue with Done Status
- **WHEN** Status is `🏆 Done` and the issue is open
- **THEN** the issue is closed as completed

#### Scenario: Open issue with Canceled Status
- **WHEN** Status is `❌ Canceled` and the issue is open
- **THEN** the issue is closed as not planned

#### Scenario: Closed issue is never reopened
- **WHEN** Status is `🌱 In Progress` and the issue is closed
- **THEN** the sweep does not reopen the issue

#### Scenario: Pending Release already closed
- **WHEN** Status is `📤 Pending Release` and the issue is closed for any reason
- **THEN** no write occurs

### Requirement: Status follows close reason
For a closed issue whose Status is empty or not a closing Status, the sweep SHALL set Status from the close reason: completed becomes `🏆 Done`, except `📤 Pending Release` from `🧪 In Review` and `📤 Pending Release` kept as is; not planned or duplicate becomes `❌ Canceled`.

#### Scenario: Closed from In Review
- **WHEN** an issue closed as completed has Status `🧪 In Review`
- **THEN** Status is set to `📤 Pending Release`

#### Scenario: Closed as not planned
- **WHEN** an issue closed as not planned has Status `🌱 In Progress`
- **THEN** Status is set to `❌ Canceled`

#### Scenario: Closed in the UI of a product repo
- **WHEN** an issue closed as completed still has Status `🌱 In Progress`
- **THEN** Status is set to `🏆 Done` and the issue stays closed

### Requirement: Mismatched close reason is reported, not changed
When a closed issue's Status is a closing Status that disagrees with its close reason (Done with an issue closed as not planned or duplicate, Canceled with an issue closed as completed), the sweep MUST NOT change it and SHALL list it in the run summary.

#### Scenario: Completed issue in Canceled
- **WHEN** an issue closed as completed has Status `❌ Canceled`
- **THEN** no write occurs and the item appears in the summary under mismatches

### Requirement: Stale blocking edges removed
The sweep SHALL remove every "blocked by" edge whose blocking issue is closed, for both open and closed blocked issues.

#### Scenario: Open issue blocked by closed issue
- **WHEN** an open issue is blocked by a closed issue
- **THEN** the edge is removed and the issue no longer shows as blocked

#### Scenario: Open blocker is kept
- **WHEN** an issue is blocked by an open issue
- **THEN** the edge is kept

### Requirement: Safe by construction
The sweep SHALL perform at most a configurable number of writes per run, defaulting to 1000, and MUST fail without writing when the planned writes exceed it. A failure on one item MUST NOT stop the run; the job SHALL end failed when any write failed. A run SHALL NOT overlap another sweep run; races with live event workflows in other repositories are handled by skipping recently edited items and by idempotent writes.

#### Scenario: Plan exceeds the cap
- **WHEN** the planned writes exceed the cap
- **THEN** no write is made and the run fails with the planned count in the summary

#### Scenario: One item fails
- **WHEN** a write fails for one item
- **THEN** the remaining items are still processed and the run ends failed

### Requirement: Idempotent and resolved live
Running the sweep twice in a row MUST produce no writes on the second run. Status options MUST be resolved by name from the live project, not from option IDs stored in the repository.

#### Scenario: Second run is a no-op
- **WHEN** a run completes with all writes applied
- **THEN** an immediate second run plans zero writes

### Requirement: Run summary
Every run SHALL publish a summary listing, per stage, the applied writes, planned writes in dry-run, failures with their error, skipped items with reason, and mismatches needing a human.

#### Scenario: Dry-run summary
- **WHEN** a dry-run finishes
- **THEN** the summary lists each planned write and states that nothing was written
