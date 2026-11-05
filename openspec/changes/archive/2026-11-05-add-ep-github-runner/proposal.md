# Proposal

## Why

The issue and project-planning automations (add to project, close to Status, blocking cleanup, later the managed callers in every private repo) run many tiny jobs: 4 to 7 seconds each, about 100 billed minutes a month once deployed, because GitHub rounds every job up to a whole minute. The org needs its GitHub-hosted minutes for the heavy CI (the `way2be` CI alone is about 78% of the monthly usage). The org owns a VPS that is almost idle (3 to 5% CPU, 11 GiB RAM free) but also hosts production sites and databases, so a runner there must be strictly confined.

## What Changes

- Add four self-hosted runner instances (`ep-github-runner-1` to `-4`), registered at organization level, all with the label `ep-github-runner`, on the existing VPS.
- Run them as a dedicated unprivileged system user `ep-github-runner`, in one systemd slice that caps the sum of their CPU, memory and tasks, with per-service hardening (no loopback access except the DNS stub, hidden processes, no site homes, no database sockets).
- Provisioning is additive only: no existing service, file, port, package or firewall rule is changed, and a before/after snapshot diff gates the work.
- The reusable engines gain a `runner` input (default `ubuntu-latest`). The managed callers deployed to private repos hardcode `runner: ep-github-runner`; no variable is involved. `.github`'s own callers, the sweep, and every repo's own CI and deploy workflows stay on GitHub-hosted runners.
- **BREAKING (accepted):** switching a repo back to hosted runners means redeploying its callers (no variable to flip).

## Capabilities

### New Capabilities
- `self-hosted-runner`: how the runner pool is provisioned, confined, capped, observed and removed on the VPS.
- `runner-selection`: how a workflow chooses between a hosted and the self-hosted runner.

### Modified Capabilities

## Impact

- Server: new user, directory, slice, template unit, cleanup script, four runner registrations. Nothing existing is modified.
- Repo: `engine-*.yml` get a `runner` input; `check-actions-layout.js` and its test learn the rule; docs.
- Other changes: `add-managed-workflows` (callers hardcode the label, rollback by redeploy) and `add-project-sweep` (the shared concurrency group is dropped, see its design).
- Depends on `restructure-to-actions` landing first.
- Needs from the owner: an organization admin to produce runner registration tokens, and a go for each server phase.
