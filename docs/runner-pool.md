# Runner pool `ep-github-runner`

Four self-hosted GitHub Actions runners on the organization's VPS that run only the lightweight issue and project-planning automations (the `engine-*` reusable workflows), so their tiny jobs do not consume the org's GitHub-hosted minutes. Every repository's own CI and deploy workflows, the public `.github` repository and the project sweep stay on GitHub-hosted runners.

## How a job lands on the pool

- Each `engine-*.yml` has a `runner` input (default `ubuntu-latest`) and uses `runs-on: ${{ inputs.runner || 'ubuntu-latest' }}`.
- The managed callers deployed to private repositories (change `add-managed-workflows`) pass the literal label `ep-github-runner`. No variable is involved.
- `.github`'s own callers pass nothing, so they run on GitHub-hosted runners. A job in a public repository that asks for the label stays queued and unassigned (the Default runner group excludes public repositories).
- `node .github/scripts/check-actions-layout.js` enforces this: the label may appear only in `.github/managed-workflows/`, never under `.github/workflows/`, and no `vars.` expression may select a runner.

## What is on the server

| Item | Where |
|---|---|
| Restricted system user `ep-github-runner` (no shell, locked password, no groups beyond its own, no sudo) | `/etc/passwd` |
| Four runner installs | `/var/lib/ep-github-runner/1` to `4` |
| Cleanup hook (removes the job workspace, keeps `_actions`, `_temp`, `_tool`) | `/var/lib/ep-github-runner/hooks/cleanup.sh` |
| Shared resource cap | `/etc/systemd/system/ep-github-runner.slice` |
| Service template, instances `ep-github-runner@1` to `@4` | `/etc/systemd/system/ep-github-runner@.service` |

Limits on the slice (sum of the four): `CPUQuota=200%`, `CPUWeight=20` (sites have 100), `MemoryHigh=1536M`, `MemoryMax=2G`, `MemorySwapMax=0`, `TasksMax=1024`; each instance `MemoryMax=768M`. Each service is confined: no loopback except the DNS stub, the host's own public addresses denied, other users' processes hidden, no `/home`, no MySQL/PostgreSQL/Redis sockets, read-only system, no capabilities. Idle footprint is about 50 MiB per instance and almost no CPU.

## Operating it

- Status on GitHub: `gh api orgs/Evolution-Perspectives/actions/runners --jq '.runners[]|"\(.name) \(.status) busy=\(.busy)"'`.
- Status on the server: `systemctl status ep-github-runner@1` (and `journalctl -u ep-github-runner@1`).
- **Restart gracefully** (`systemctl restart ep-github-runner@N`): back online in about a second. A hard kill leaves a stale session on GitHub and the runner shows offline for about 2.5 minutes before it reconnects by itself.
- The runner application updates itself; leave auto-update on (GitHub stops queuing jobs to a runner more than 30 days out of date).
- Registering an instance: request a one-hour token with `gh api -X POST orgs/Evolution-Perspectives/actions/runners/registration-token`, pass it to `config.sh` through the environment variable `ACTIONS_RUNNER_INPUT_TOKEN` (never on a command line or in a file), with `--labels ep-github-runner --runnergroup Default`.
- The unit denies the VPS's own public IPv4 and IPv6 addresses. **If the VPS address changes, update the two literals in `IPAddressDeny=`** or apps bound to all interfaces become reachable from jobs.
- Required free space: the runner folders use about 0.7 GB each; the hook keeps the workspaces clean.

## Bursts: queuing and concurrency

- **Capacity:** four runners, one job each at a time; an event job takes about 5 to 10 seconds, so the pool absorbs roughly 0.5 jobs per second. A burst (the biggest seen: 45 issues closed in two minutes, so about 90 jobs) drains in a few minutes; nothing is lost, jobs wait in the queue for up to 24 hours.
- **One issue, one run at a time, nothing dropped:** every managed caller has the concurrency group `org-issue-<repository>-<issue number>` with `queue: max`, so the events of one issue (opened, then closed) run in order, one issue never uses two runners at once, and the default behavior of replacing a pending run (which would lose an event) does not apply. The group is per repository, so repositories do not block each other.
- **No stuck job:** every engine job has `timeout-minutes` (5 for the event engines, 30 for the sweep and the deploy), so a hung job frees its runner instead of holding it for hours (a self-hosted job may otherwise run for days).
- **The sweep does not cause a storm:** it writes with the automation token, so a close it performs fires the managed callers in that repository; a Status or blocking-link change fires nothing. Those runs are redundant but harmless, and the sweep spaces its closes (`close_pause_ms`, 4 s) and is capped by `max_writes`, which keeps the arrival rate under the pool capacity.
- **Lost events:** if a run is lost (pool down for more than a day, cancelled), the Friday sweep corrects Status and links.

## When the pool is down

Jobs wait in the queue for up to 24 hours and then fail, so issue events can be lost. The weekly sweep (Friday, GitHub-hosted) catches up on Status and blocking links. To send repositories back to GitHub-hosted runners, redeploy the managed callers with an empty `runner` (manifest override), done in one run of the deploy tool.

## Removing it

Remove the four registrations (`config.sh remove` or the organization runner list), `systemctl disable --now ep-github-runner@1 ... @4`, delete the unit files, the slice file and `/var/lib/ep-github-runner`, `userdel ep-github-runner`, then `systemctl daemon-reload`.

## Rules for any change on the server

Additive and reversible only: never modify or restart an existing service, change an existing configuration file, install packages, or touch the firewall or SSH. Snapshot the server before and after and stop on any difference outside the runner units.
