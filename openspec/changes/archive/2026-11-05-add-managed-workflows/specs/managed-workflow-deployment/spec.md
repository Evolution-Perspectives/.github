## Purpose

Deploy and keep in sync the managed caller workflows and their secret across all org repositories from `.github`, without disturbing any file a repository owns.

## ADDED Requirements

### Requirement: Only managed files are touched
The deploy job SHALL create, update or delete only files under `.github/workflows/` whose name starts with `org-` and whose content has the managed header. It MUST NOT read or modify any other file in a target repo.

#### Scenario: Repo-owned workflows untouched
- **WHEN** a repo has `ci.yml`, `deploy-prod.yml` and no managed files
- **THEN** the deploy adds only `org-*.yml` and leaves `ci.yml` and `deploy-prod.yml` unchanged

#### Scenario: Look-alike file without header
- **WHEN** a repo has an `org-custom.yml` without the managed header
- **THEN** the deploy leaves it alone and reports a conflict

### Requirement: Changes arrive as pull requests
For a repo with content, the deploy SHALL propose changes on one fixed branch with one pull request limited to managed files, and MUST NOT push to the default branch. An empty repo, which cannot hold a pull request, MAY receive the files as its first commit.

#### Scenario: Update opens or refreshes a PR
- **WHEN** a managed file differs from its source
- **THEN** the deploy opens a pull request on the fixed branch, or updates the open one, and does not open a second

#### Scenario: Already in sync
- **WHEN** every managed file matches its source
- **THEN** the deploy opens no pull request and makes no commit

### Requirement: Removal of retired callers
When a caller is removed from the source, the deploy SHALL propose deleting its file in each repo, only if the file carries the managed header.

#### Scenario: Caller retired
- **WHEN** a caller is deleted from `.github/managed-workflows/`
- **THEN** each repo receives a pull request deleting its managed copy

### Requirement: Manifest controls scope
A manifest SHALL list the callers to deploy, the repos to exclude, and per-repo overrides (ref). New non-archived repos in the org SHALL be included by default.

#### Scenario: Excluded repo
- **WHEN** a repo is listed as excluded
- **THEN** the deploy skips it and states so in the report

#### Scenario: New repo
- **WHEN** a new repo is created in the org
- **THEN** the next deploy includes it without a manifest change

### Requirement: Secret provisioning
The deploy SHALL ensure each included repo has the automation token as a repo-level secret, and MUST NOT print its value in logs.

#### Scenario: Secret missing
- **WHEN** a repo lacks the secret
- **THEN** the deploy sets it and records that it did so, without logging the value

### Requirement: Dry-run, drift report and safety
A deploy SHALL support dry-run, defaulting to on for manual runs, that lists per repo what would change. A scheduled run SHALL report repos whose managed files drifted or are missing. A failure in one repo MUST NOT stop the others, and the job SHALL end failed when any repo failed.

#### Scenario: Dry-run report
- **WHEN** a dry-run finishes
- **THEN** the summary lists per repo the files to add, update or delete and the secret status, and nothing is written

#### Scenario: One repo fails
- **WHEN** the API rejects a write for one repo
- **THEN** the other repos are still processed and the run ends failed

### Requirement: Idempotent
Deploying twice with no source change MUST produce no changes on the second run.

#### Scenario: Second run
- **WHEN** a deploy completes and is repeated
- **THEN** the second run reports every repo in sync
