# Preflight record (group 1, read-only)

> The raw evidence this record refers to (`before-snapshot.txt`, `after-group*.txt`, `proofs/`, `provisioned-files/`) contains server details and is kept locally in the gitignored `openspec/evidence/add-ep-github-runner/`, because this repository is public. The summaries below are the committed record.

Taken 2026-11-04 23:14 UTC. Nothing was created or changed on the server. The full snapshot is in `before-snapshot.txt` (services, sockets, processes per user, identity-file hashes, config-tree hashes for nginx, ssh, mysql, postgresql, redis, php and ufw, firewall rules, cgroups, disk).

## 1.2 Prerequisite checklist

| Item | Result |
|---|---|
| cgroup v2, systemd 255 | yes (`cgroup2fs`, systemd 255.4) |
| `CONFIG_CGROUP_BPF` (IP filtering per unit) | `y` |
| Disk | 140 GB free on `/` (28% used), inodes 7% |
| Names free: user, group, `/var/lib/ep-github-runner`, `ep-github*` units | all free |
| Libraries for the runner | libicu74, libssl3t64, libkrb5-3 present |
| Tools | curl, tar, sha256sum, jq, git present |
| Outbound 443 | api.github.com 200, github.com 200, codeload 301, pipelines.actions 404, results-receiver 404, objects 404, release-assets 404, github-releases 403, ghcr.io 301, a blob.core.windows.net host 400 (all reachable; non-2xx are expected for bare requests) |
| Latest runner release | v2.338.2 (2026-10-26), `actions-runner-linux-x64-2.338.2.tar.gz`, 228,071,396 bytes, sha256 `baebf204307bac6193480852732f0aba2ae97b6c5597c244f4d5558390147c40` (from the release metadata) |

## 1.3 Exact list of what would be created (awaiting owner approval)

On the server, nothing else:

1. System user and group `ep-github-runner` (adds one line each to `/etc/passwd`, `/etc/group`, `/etc/shadow`, `/etc/gshadow`; no other account touched).
2. Directory tree `/var/lib/ep-github-runner/` mode 700 with `1/`, `2/`, `3/`, `4/` (one runner install each, about 0.5 GB unpacked each by estimate) and `hooks/cleanup.sh`.
3. `/etc/systemd/system/ep-github-runner.slice`.
4. `/etc/systemd/system/ep-github-runner@.service` (template for instances 1 to 4).
5. `systemctl daemon-reload` (re-reads units, restarts nothing).
6. Four organization-level runner registrations on GitHub (names `ep-github-runner-1` to `-4`, label `ep-github-runner`).

Not touched: nginx, PHP-FPM, Node/PM2, MySQL, PostgreSQL, Redis, memcached, Varnish, ufw, sshd, cron, any package, any site user or home, the two stale `way2be` runner folders.

## Approval and group 2 record (2026-11-05)

Owner approval of the list above: "triple check it please then go for it" (2026-11-05). Group 2 ran on the VPS; nothing was enabled, started or registered.

- User/group `ep-github-runner`: uid 999, gid 988, shell `/usr/sbin/nologin`, password locked (`!`), only its own group, no sudo/adm/docker/lxd, home `/var/lib/ep-github-runner` mode 700. Verified: cannot list site home directories, cannot read `/etc/shadow`, sudo needs a password, SSH login refused.
- Runner v2.338.2 downloaded as the new user, SHA-256 verified (OK), extracted into `/var/lib/ep-github-runner/1` to `4` (683 MB each, 2.9 GB total), `runsvc.sh` copied to each root as the official service script does; everything owned by the new user. The service host uses the runner's own bundled Node 24, not the system Node.
- Files installed: `/etc/systemd/system/ep-github-runner.slice`, `/etc/systemd/system/ep-github-runner@.service` (root, 0644), `/var/lib/ep-github-runner/hooks/cleanup.sh` (runner user, 0700); copies in `provisioned-files/`. `systemd-analyze verify` is clean; offline exposure score 3.8 OK. `daemon-reload` only. Template shows `disabled` / `inactive`.
- Hook script tested locally in a fake tree: removes workspace dirs, keeps `_actions`, `_temp`, `_tool`, ignores bad or empty instance ids, always exits 0.
- After-snapshot diff (`after-group2.txt` vs `baseline-group2.txt`): services, failed units, listening sockets, DB status, nginx/ssh/mysql/postgresql/redis/php/ufw config trees, ufw rules, cgroups and home dirs are identical. Differences are exactly: +1 line in each of `/etc/passwd`, `/etc/group`, `/etc/shadow`, `/etc/gshadow` (with that line removed each file hashes to the baseline, byte for byte); +2 files in `/etc/systemd/system` (the slice and the template); +1 entry in `/var/lib`; the root process count moved 138 to 142 (my own SSH sessions). The only other recently modified file outside ours was fail2ban's own database.

## Group 3 record (2026-11-04 23:22 to 23:30 UTC, 2026-11-05 00:22 in Paris)

Owner go: "ok lets go please, triple check stuff up and do it". Only throwaway transient units were used; nothing was registered, enabled or left running. Full outputs are in `proofs/`.

- Confinement (3.1): see "Proof results" in design.md. One leak found and fixed in our own unit (the host's own public addresses), then re-proved.
- Caps (3.2): CPU 0.50 of 0.50 (scaled) and 1.84 of 2.00 cores (real) across four units; sites unaffected (latency, pressure, load). Memory kill stays inside the runner slice.
- Cleanup (3.3): no test unit, runtime override or stray file remains; slice limits are back to the file values. Diff against the state after group 2: only the root process count (my SSH sessions) and the new top-level cgroup `ep.slice` (implicit parent of the runner slice) differ; services, ports, configs and identity files are identical.

## Group 4 record (2026-11-04 23:30 to 23:35 UTC)

Owner decision: "do it yourself" (registration tokens obtained by `gh`). Done: four registrations, units started and enabled, restart tests. Details in design.md "Registration and first-run results". After-snapshot (`proofs/after-group4.txt`) differs from after-group3 only by: the four active runner services, the runner user's processes (12) and my SSH-session count. No new listening socket (the runners only open outbound connections to GitHub).

## Group 5 and 6 record (2026-11-04 23:44 to 23:50 UTC)

Owner go: "lets go, dont forget to clean up the it lab repo after youre done". Results and cleanup verification in `proofs/group5-summary.md`. Final snapshot (`proofs/after-group5.txt`) equals the one after group 4 except my SSH-session count; no runner error in the journal other than the deliberate SIGKILL test, and the two kernel OOM lines are the group 3 memory test.
