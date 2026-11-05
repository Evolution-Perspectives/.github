# Tasks

> Server groups (2 to 6) change the production VPS. Each starts only on the owner's explicit go for that group, and each is additive and reversible. Group 1 is read-only.

## 1. Preflight (read-only)

- [x] 1.1 Take the before-snapshot (active services, listening ports, site/PM2/Node processes, MySQL and PostgreSQL status, load, memory, `/etc/passwd` and `/etc/group` line counts) and save it. Verify: the file exists and is complete.
- [x] 1.2 Re-check prerequisites (cgroup v2, systemd version, `CGROUP_BPF`, free disk, `ep-github-runner` name unused, outbound 443 to GitHub hosts including `*.actions.githubusercontent.com` and `*.blob.core.windows.net`). Verify: a written checklist with all items green.
- [x] 1.3 Get the owner's approval of the exact list of files, user and units that will be created. Verify: approval recorded in this file.

## 2. Provision (additive)

- [x] 2.1 Create the restricted system user `ep-github-runner`: `useradd --system` with home `/var/lib/ep-github-runner`, shell `/usr/sbin/nologin`, locked password, no SSH key, only its own primary group (not in `sudo`, `adm`, `docker`, `lxd` or any site group), umask 077; and `/var/lib/ep-github-runner` owned by it with mode 700. Verify: `id` shows only its own group, `getent shadow` shows a locked password, an SSH login as this user is refused, `stat` shows 700, and it cannot read or enter any `/home/<site>`.
- [x] 2.2 Install the runner release (latest, checksum verified) into four folders `/var/lib/ep-github-runner/1` to `4`, extracted as the new user. Verify: sha256 matches the release notes and files are owned by the new user.
- [x] 2.3 Add `ep-github-runner.slice`, the template unit `ep-github-runner@.service` with the hardening and limits from design.md, and the cleanup hook script; run `systemctl daemon-reload` only. Verify: `systemd-analyze verify` is clean and no existing unit changed state.

## 3. Prove confinement and caps (nothing registered)

- [x] 3.1 With throwaway transient units under the same slice and properties, probe as the runner user: Redis, memcached, a PHP-FPM port, a site app port, MySQL/PostgreSQL/Redis sockets, `/home`, other users' processes, DNS and `api.github.com`. Include the host's own public IPv4 and IPv6 addresses (apps bound to all interfaces). Verify: every forbidden path fails and DNS and GitHub succeed; record the output (done: `proofs/`, one leak found and fixed).
- [x] 3.2 At a quiet hour (23:00 to 05:00 UTC), run the stress test with small limits first: four CPU burners then a memory allocation inside the slice, watching nginx, PM2 apps, MySQL, load and memory. Verify: total CPU stays at or under 200%, the kill stays inside the slice, and sites show no change.
- [x] 3.3 Clean up: transient units are gone and the after-snapshot equals the before-snapshot plus the new files. Verify: snapshot diff recorded.

## 4. Register and start

- [x] 4.1 The owner provides four one-hour registration tokens (or authorizes `gh`); register the four instances at organization level with label `ep-github-runner`, names `ep-github-runner-1` to `-4`, Default group, with a fresh one-hour token per instance, obtained by `gh` (owner login has `admin:org`) and piped over SSH into an environment variable of the `config.sh` process (never on disk, never in a process argument). Verify: the organization runner list shows four online runners with the label and no token remains on disk.
- [x] 4.2 Enable and start `ep-github-runner@1` to `@4`. Verify: all four `active (running)`, `Restart=always` confirmed by killing one test process and seeing it return online, and the sites unchanged.

## 5. Prove in a real job

- [x] 5.1 In a private test repo (for example `it-lab`) add a throwaway workflow (push-triggered on a temporary branch, since `workflow_dispatch` needs the default branch and the API token lacks the `workflow` scope; pushed over SSH) with `runs-on: ep-github-runner` that prints user, hostname, cgroup and the failed loopback probes, and run it. Verify: it ran on the pool, as the runner user, inside the slice, with loopback blocked; record the run ID and proof lines.
- [x] 5.2 Run eight jobs at once to see four run and four queue, then drain. Verify: peak CPU and memory stay under the slice limits.
- [x] 5.3 Remove the throwaway workflow and branch. Verify: neither remains.
- [x] 5.4 Confirm a job in a public repository requesting the label stays unassigned (queued) and then cancel it. Verify: the run is cancelled and the public repo ran nothing on the pool.

## 6. Footprint and final state

- [x] 6.1 Measure idle and busy memory and CPU per instance and replace the estimates in design.md. Verify: numbers recorded.
- [x] 6.2 Take the after-snapshot and diff it with the before-snapshot. Verify: no difference outside the new units; record the result.

## 7. Repository changes (no server access)

- [x] 7.1 Add the `runner` input (default `ubuntu-latest`) to the five engines and use it as `runs-on`. Verify: engine tests and `check-actions-layout.js` pass and a run with the default still uses `ubuntu-latest`.
- [x] 7.2 Teach `check-actions-layout.js` and its test the rule: no engine hardcodes `ep-github-runner`, only managed caller templates may contain it, no `vars.` runner expression. Verify: tests fail on a planted violation and pass on the real tree.
- [x] 7.3 Document the pool (what runs on it, the label, the rollback by redeploy, the offline behavior) in `usecases.md` and a runbook. Verify: sections present and consistent with the specs.

## Workflow follow-up

- Enabling the label happens in `add-managed-workflows` (callers hardcode `runner: ep-github-runner`).
- Decide separately whether to remove the two stale `way2be` runner installs and their offline registrations.
- Archive this change after the review and re-measure after the first managed burst.
