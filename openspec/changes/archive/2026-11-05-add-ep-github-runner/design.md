# Design

## Context

Facts gathered read-only on 2026-11-04 and 2026-11-05 (see proposal.md for motivation):

- **Host:** one KVM VPS, Ubuntu 24.04, 4 vCPU (AMD EPYC), 15 GiB RAM, 2 GiB swap, 193 GB disk with 140 GB free, systemd 255 on cgroup v2 (`CGROUP_BPF` on). It also runs production and staging sites under one Linux user per site (CloudPanel nginx, PHP-FPM, Node/PM2, MySQL, PostgreSQL, Redis, memcached, Varnish). No Docker, no runner running.
- **Load (8.5 days, 10-minute samples):** CPU busy median 3.6%, p99 8.4%, max 13% (about 0.5 core); steal median 2%, max 11%; RAM available at least 11.1 GiB; swap never used; run queue p95 2, max 9. Busiest hours 08:00 to 13:00 UTC.
- **Isolation facts:** site homes are mode 770 (owner:group); only `ubuntu` is in `sudo`/`adm`; `/proc` has no `hidepid`; Redis, memcached and the PHP-FPM pools (127.0.0.1:11000 to 20000) listen on loopback without credentials; MySQL and PostgreSQL sockets are world-connectable; the root cgroup already delegates `cpu memory pids`; `system.slice` delegates only `memory pids`.
- **Stale leftovers (not ours, do not touch):** two unused runner installs for one product repo under two site home directories, no services.
- **GitHub plan facts:** the org is on Free: one Default runner group (all private repos, public excluded); organization variables are documented as not available to private repos; self-hosted usage is not billed in Actions minutes (the $0.002 platform charge was postponed with no date); a self-hosted runner runs one job at a time; a job waits at most 24 hours in the queue; runners must update within 30 days or jobs stop being queued to them; hosted runners are billed per job rounded up to the minute.
- **Demand:** about 99 billed minutes a month for the automations (9 opened and 45 closed issues in 30 days); one real burst in 90 days of 45 closes in about 2 minutes.

## Goals / Non-Goals

**Goals:**
- Run the automations' jobs on the VPS with zero risk to the sites and databases.
- Hard-cap the pool's combined CPU and memory.
- Target the pool explicitly with a hardcoded label, no variable.

**Non-Goals:**
- Moving any repo's own CI or deploy workflows; Docker or Playwright on this host.
- Running anything from the public `.github` repository on the pool.
- Removing the two stale `way2be` runner installs (a separate decision for the owner).
- Hardening SSH, nginx or any existing service.

## Decisions

- **Name `ep-github-runner`** for the user, directory, slice, template unit and label; instances are `ep-github-runner-1` to `-4`.
- **Four persistent instances from one template unit** `ep-github-runner@.service`, each in `/var/lib/ep-github-runner/<n>`. Alternative: ephemeral just-in-time runners, rejected because re-registering needs a long-lived organization admin token on a production host.
- **One top-level slice `ep-github-runner.slice`** (its implicit parents `ep.slice` and `ep-github.slice` are created at the root next to `system.slice`), so no existing cgroup or controller is changed. Limits: `CPUQuota=200%`, `CPUWeight=20` (sites 100), `MemoryHigh=1536M`, `MemoryMax=2G`, `TasksMax=1024`. Each instance also gets `MemoryMax=768M` so one runaway job cannot starve the other three. The effective limit is the most stringent of the unit and its parent slice. `io` is not limited, to avoid enabling the io controller at the root.
- **Per-service hardening:** `User=ep-github-runner`, `NoNewPrivileges`, `PrivateTmp`, `ProtectHome=yes`, `ProtectProc=invisible`, `ProcSubset=pid`, `ProtectSystem=strict` with `ReadWritePaths=/var/lib/ep-github-runner`, `IPAddressAllow=127.0.0.53` then `IPAddressDeny=localhost` (Allow wins over Deny), `InaccessiblePaths=/run/mysqld /run/postgresql /run/redis`, `Restart=always`. `MemoryDenyWriteExecute` stays off because the .NET runner needs JIT. Combination with the runner is untested until the proof phase.
- **Cleanup hook:** `ACTIONS_RUNNER_HOOK_JOB_COMPLETED` points to a script outside the runner folder that empties the job workspace and temp directory but keeps `_work/_actions` (downloaded actions cache). A failing hook fails the job, so it stays trivial.
- **Auto-update left on.** Disabling it forces manual updates within 30 days.
- **Organization-level registration**, label `ep-github-runner`, Default group (public repos excluded by default). Registration token: produced by an org admin (UI, or `gh` if their login allows), valid one hour, passed through a `chmod 600` file that is deleted right after.
- **Label hardcoded in callers, not in engines (option B, confirmed by the owner).** Engines take `runner` (default `ubuntu-latest`); managed callers in private repos pass the literal `ep-github-runner`. Alternative A hardcodes it in the engines: rejected because `.github` is public and excluded from the Default group, so its own dogfooding jobs would wait forever. Alternative: an org or repo variable, rejected by the owner (and org variables do not reach private repos on Free).
- **Rollback to hosted costs a redeploy** of the callers with an empty `runner`, done in one run of the deploy tool.
- **Additive-only rules and gates:** snapshot (services, ports, processes, DB status, load, memory) before and after; any difference outside the new units stops the work. Provisioning order: read-only preflight, create, prove confinement with throwaway transient units, only then register.

## Proof results (group 3, 2026-11-04 23:22 to 23:30 UTC)

- Probe inside a transient unit with the template's properties, before the fix: loopback services blocked (Redis, memcached, PHP-FPM, Go apps, nginx), DNS stub open, GitHub reachable, `/home`, `/root`, `/run/mysqld`, `/run/postgresql`, `/run/redis` and `/proc/1/environ` denied, `/etc` read-only, no capabilities, 4 visible processes, correct cgroup. **Finding:** the apps bound to all interfaces were OPEN through the host's own IPv4 and IPv6 addresses (several application ports and the cache). After adding the host addresses to `IPAddressDeny`, the only open path is the DNS stub (`proofs/probe-before-fix.txt`, `proofs/probe-after-fix.txt`). Database ports were deliberately not probed.
- CPU cap across units: four busy units under a runtime quota of 50% used 0.50 cores in total; under the real 200% quota they used 1.84 cores over the 16 s window (two cores for the 15 s the burners ran), with throttling visible in `cpu.stat`. The sites' cgroup showed at most 2.5% CPU pressure and nginx latency stayed between 0.3 and 2.7 ms (baseline 0.3 to 1.8 ms).
- Memory cap: with `MemoryHigh` set the slice is throttled (200 MiB held at 192 MiB high, no kill); with only `MemoryMax=256M` the kernel killed two of four 100 MiB allocators, with `oom_memcg` and `task_memcg` both inside `/ep.slice/ep-github.slice/ep-github-runner.slice`; process counts of nginx, MySQL, PostgreSQL, Node, PHP-FPM and Redis were identical before and after.
- A first stress attempt aborted on my own guard, which read global CPU pressure (throttled burners count as pressure); the guard now uses the sites' cgroup pressure. All test units were removed and the slice limits restored.

## Registration and first-run results (group 4, 2026-11-04 23:30 to 23:35 UTC)

- Registered `ep-github-runner-1` to `-4` at organization level, Default group, labels `self-hosted, Linux, X64, ep-github-runner`; started and enabled `ep-github-runner@1..4`; all four online, running under the full hardening of the template (the .NET runner works with it unchanged).
- Tokens: requested one per instance with `gh api -X POST orgs/Evolution-Perspectives/actions/runners/registration-token`, piped over SSH into `ACTIONS_RUNNER_INPUT_TOKEN` of the `config.sh` process; the runner logs only that it removed the variable, no value. Nothing token-like remains on disk.
- Footprint measured: about 47 to 49 MiB and 20 to 23 tasks per idle instance, 191 MiB for the pool, 0.005 cores idle; startup of four instances burst to about 58 CPU-seconds and a 419 MiB peak, throttled by the 200% quota; the sites' pressure stayed 0.
- Crash behavior: a SIGKILL of one instance was restarted by systemd after 10 s, but GitHub kept the runner offline for about 2.5 minutes ("A session for this runner already exists", retried every 30 s) until the stale session expired; a graceful `systemctl restart` was back online in about 1 s. Jobs wait in the queue meanwhile, so planned restarts should be graceful.
- `motd-news.service` is failed on the VPS since before this work (present in the baseline); unrelated.

## Real-job proof and footprint (group 5 and 6, 2026-11-04 23:44 to 23:50 UTC)

See `proofs/group5-summary.md`. A job in a private repo ran on the pool as the runner user, inside the slice, with loopback, host addresses, home directories and database sockets blocked, and its workspace removed by the hook. Eight simultaneous jobs ran four at a time (peak concurrency 4, 56 s in total). Measured: idle about 47 to 49 MiB per instance and 0.005 cores for the pool; with four busy instances the pool peaked at 498 MiB and sat at its 2-core quota, sites' CPU pressure at most 0.58, load average at most 3.33. A job in the public `.github` repo asking for the label stayed queued and unassigned. The API token lacks the `workflow` scope, so throwaway workflow files must be pushed over SSH.

## Risks / Trade-offs

- [Workflow code runs on a host with production data] → dedicated user, hardening above, aggregate caps, label not usable from public repos, proof tests before registration, and the same 2.5 core / 5.7 GiB worst-case ceiling.
- [Loopback services without credentials (Redis, memcached, PHP-FPM)] → `IPAddressDeny=localhost`; verified in the proof phase from inside a real job, not assumed.
- [The slice cap is documented per unit; its sum behavior across children is expected from cgroup v2 but not proven here] → stress test with four busy transient units at a quiet hour (23:00 to 05:00 UTC), small limits first, watching the sites.
- [Server or runner down] → jobs queue up to 24 hours and then fail; events are lost until the weekly sweep; mitigation is the visible offline status and the redeploy-to-hosted rollback.
- [Any private repo can request the label (Default group is visible to all)] → accepted, same trust boundary as the org; a unique label only prevents accidents.
- [Secondary rate limits on the PAT during bursts] → at most four concurrent jobs, gentler than twenty hosted ones.
- [Disk fill by a runaway job] → cleanup hook and a free-space check on `/var/lib/ep-github-runner`; no quota available.

## Migration Plan

1. Preflight, read-only: snapshot, prerequisites, owner approval of the exact file list.
2. Provision (additive): user, directory, slice, template unit, hook; `daemon-reload` only.
3. Prove confinement and caps with transient units, nothing registered.
4. Register the four instances and start them; confirm online.
5. Prove from a real job in a private test repo (throwaway workflow on a temporary branch) that the pool is used and loopback is blocked; remove the workflow and branch.
6. Snapshot diff; measure idle and busy footprint.
7. Repository change: engines get `runner`; layout check and docs. Enabling in the callers happens in `add-managed-workflows`.
8. Rollback at any step: deregister runners, `systemctl disable --now`, remove units, slice, user and directory, compare with the before-snapshot.

Test-data cleanup: the throwaway workflow, its branch and any test issues are removed and their removal is verified; server transient units vanish on stop.

Required token scopes: runner registration needs organization administration rights (`admin:org` or the fine-grained "self-hosted runners" organization permission). If the owner's token lacks them, the owner generates the token in Settings, Actions, Runners instead; nothing proceeds without it.

## Open Questions

- Whether to remove the two stale `way2be` runner installs and their offline GitHub registrations (separate decision).
