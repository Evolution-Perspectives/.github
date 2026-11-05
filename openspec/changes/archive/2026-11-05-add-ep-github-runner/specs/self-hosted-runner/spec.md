# Spec Delta

## Purpose

Run the org's lightweight issue and project automations on a pool of self-hosted runners hosted on the existing VPS, without endangering the production sites and databases that share the machine.

## ADDED Requirements

### Requirement: Dedicated unprivileged identity
The runners SHALL run as a dedicated system user `ep-github-runner` with no login shell, no supplementary groups, no sudo rights and a restrictive umask, and SHALL NOT run as root or as any site user.

#### Scenario: Identity has no reach into sites
- **WHEN** a command runs as `ep-github-runner`
- **THEN** it cannot list or read any `/home/<site>` directory and cannot become another user

### Requirement: Additive provisioning
Provisioning SHALL only add the user, its directory, the slice, the unit files and the cleanup script. It MUST NOT modify, restart or reload any existing service, change an existing configuration file, install or upgrade packages, or alter the firewall or SSH settings.

#### Scenario: Before and after snapshots match
- **WHEN** provisioning completes
- **THEN** the list of active services, listening ports, site processes and database status taken before equals the one taken after, apart from the new runner units

#### Scenario: A difference stops the work
- **WHEN** the snapshot diff shows a change outside the new units
- **THEN** provisioning stops and the change is rolled back

### Requirement: Aggregate resource cap
All runner instances SHALL belong to one systemd slice that limits their combined CPU, memory and task count, with a lower CPU weight than the site workloads, so the sum of the runners cannot exceed the cap whatever the number of busy instances.

#### Scenario: Four busy runners stay under the cap
- **WHEN** all four instances run CPU-heavy work at the same time
- **THEN** their total CPU use does not exceed the slice quota

#### Scenario: Memory overrun stays inside the slice
- **WHEN** runner processes exceed the slice memory limit
- **THEN** only processes of the runner slice are terminated and no site or database process is affected

### Requirement: Confinement of runner processes
Each runner service SHALL be unable to reach loopback services other than the DNS stub, unable to see other users' processes, unable to access site home directories, and unable to open the MySQL, PostgreSQL and Redis sockets.

#### Scenario: Loopback services are unreachable
- **WHEN** a job tries to connect to Redis, memcached, a PHP-FPM pool or a site application on 127.0.0.1
- **THEN** the connection is refused or blocked

#### Scenario: The host's own addresses are unreachable
- **WHEN** a job tries to connect to an application bound to all interfaces through the host's own public IPv4 or IPv6 address
- **THEN** the connection is blocked

#### Scenario: Name resolution and GitHub still work
- **WHEN** a job resolves and requests `api.github.com`
- **THEN** the request succeeds

### Requirement: Organization-level pool with one label
Four runner instances SHALL be registered at organization level in the Default runner group, each with a distinct name and the shared label `ep-github-runner`, and public repositories SHALL NOT be allowed to use them.

#### Scenario: Public repository cannot use the pool
- **WHEN** a job in a public repository requests the label `ep-github-runner`
- **THEN** it is not assigned to the pool

#### Scenario: Burst is shared
- **WHEN** more jobs arrive than idle instances
- **THEN** the extra jobs wait in the queue and run as instances become idle

### Requirement: Job hygiene
After each job a cleanup hook SHALL remove the job workspace and temporary files so no job state persists to the next job, while keeping the downloaded-actions cache.

#### Scenario: Workspace is clean for the next job
- **WHEN** a job writes files to its workspace and temporary directory and finishes
- **THEN** the next job on the same instance finds neither

### Requirement: Availability and observability
Each runner service SHALL restart automatically after a failure, keep the runner application on its default auto-update, and expose its online or offline status through the GitHub API, so an outage is visible.

#### Scenario: Service restarts
- **WHEN** a runner process crashes
- **THEN** systemd restarts it and the instance returns to online

#### Scenario: Outage is visible
- **WHEN** an instance is stopped
- **THEN** the organization runner list reports it offline

### Requirement: Full reversibility
The provisioning SHALL be removable by deregistering the runners, stopping and disabling the units, and deleting the user, its directory, the slice and the unit files, leaving the server as it was.

#### Scenario: Removal
- **WHEN** the removal procedure is run
- **THEN** no runner unit, user, directory or registration remains and the before-snapshot matches again
