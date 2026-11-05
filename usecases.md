# Project Use Cases

Implementation lives in `actions/<name>/` (one TypeScript action per automation, each with a README): `close-status-sync`, `close-state-sync`, `blocking-cleanup`, `add-to-project`, `delete-on-removal`, `sweep`, `managed-deploy`.

## Use Case 1 - What Happens to Project Status When an Issue Is Closed

Goal: Clarify how closing a GitHub issue relates to the Project Status field.

Plain rule:

- Closing an issue (via UI, `gh issue close`, commit keyword, PR merge, or API) automatically sets the Project Status field, based on `state_reason`.
- Setting the Project Status field to `🏆 Done`, `📤 Pending Release` or `❌ Canceled` automatically closes the linked issue, and moving a closed issue's Status to any other option automatically reopens it.
- `📤 Pending Release` means the team's work is finished (reviewed, on staging) and only the release is left. The issue is closed so progress and burn-up count it; `🏆 Done` then means released.
- `📡 Pending Deploy` is an open state: the issue stays open (a closed issue moved there is reopened).
- Both directions are idempotent reconciles: no write happens if the issue/Status are already in the target state, so the two directions do not loop off each other.

How it works:

1. `org-issue-closed-sync-status.yml` fires on `issues: closed` for every close and reads `state_reason`:
   - `completed` → Status `🏆 Done`, except: closed while in `🧪 In Review` → Status `📤 Pending Release`; already in `📤 Pending Release` → Status kept
   - `not_planned` or `duplicate` → Status `❌ Canceled`
2. `hook-project-item-updated-sync-close-state.yml` fires on the org-level `projects-v2-item-updated` relay whenever a Project item's fields change, and reconciles the linked issue's close state against the current Status:
   - Status `🏆 Done` → issue closed as `completed`
   - Status `📤 Pending Release` → issue closed as `completed` (an already closed issue is left alone, whatever its close reason)
   - Status `❌ Canceled` → issue closed as `not_planned`
   - Any other Status, while the linked issue is closed → issue reopened
   - Project items with no linked issue (drafts, PRs) are skipped
3. `org-issue-closed-remove-blocking.yml` still fires independently on `issues: closed` and removes all blocking relationships of the closed issue, in both directions: the issues it was blocking are unblocked, and its own "blocked by" links are dropped.

Project Status field options (single-select):

- `📦 Backlog`
- `💎 Ready`
- `🌱 In Progress`
- `⏳ Paused`
- `📡 Pending Deploy`
- `🧪 In Review`
- `📤 Pending Release`
- `🏆 Done`
- `❌ Canceled`

Notes:

- Manually setting a closed issue's Status to a non-Done/Canceled option reopens it, even if the original close reason still applies.
- Manually flipping Status to `🏆 Done`/`❌ Canceled` on an issue that's open, or closed for a different reason, re-closes it to match — the Status → close mapping always applies, not just at close time.
- Closing an issue that is not in `🧪 In Review` or `📤 Pending Release` still means `🏆 Done`, so for work that has a release step, set `📤 Pending Release` (or close from `🧪 In Review`) instead of closing early.
- Closing an issue also removes its blocking links in both directions (`org-issue-closed-remove-blocking.yml`), so dependents are unblocked when an item reaches `📤 Pending Release`, not when it is released.

## Use Case - Where the Issue Automations Run

Goal: Keep the org's GitHub-hosted minutes for heavy CI by running the tiny issue and project-planning jobs on the org's own runners.

Plain rule:

- The `engine-*` workflows take a `runner` input. By default they run on GitHub-hosted `ubuntu-latest`.
- The managed callers in private repositories ask for the self-hosted pool by its label `ep-github-runner`, hardcoded in the caller (no variable).
- The public `.github` repository, the weekly sweep, and every repository's own CI and deploy workflows always stay on GitHub-hosted runners.
- If the pool is down, jobs queue for up to 24 hours; the Friday sweep corrects the board afterwards.

Details and operations: `docs/runner-pool.md`.

## Use Case - The Weekly Project Sweep

Goal: Heal the drift that the event-driven automations miss in repositories where they do not run, once a week and without installing anything in those repositories.

Plain rule:

- Early every Friday (02:07 UTC, before the sprint starts) the sweep reads the whole project once and runs three stages over that snapshot: **close** (an open issue whose Status is Done, Pending Release or Canceled is closed; a closed issue is never reopened), **Status** (a closed issue with an empty or non-closing Status gets the Status matching its close reason) and **blocking** (every "blocked by" link whose blocker is closed is removed).
- A closing Status that disagrees with the close reason (Done on an issue closed as not planned, Canceled on a completed one) is never changed: it is listed in the run summary for a human.
- Manual runs are dry runs by default and plan without writing. Scheduled runs write only when the repository variable `SWEEP_WRITE` is `true`; until then they are dry runs too.
- A plan above 50 writes writes nothing and fails the run (a dry run only warns). Items edited in the last 10 minutes are skipped. A second run right after a real one plans zero writes.
- The sweep has its own concurrency group; it does not share one with the event workflows because groups are per repository and the event workflows run in the product repositories. Races with live events rely on the recent-edit skip and on writes that are safe to repeat.

Details: `actions/sweep/README.md`.

## Use Case - Managed Callers in Every Repository

Goal: Make the issue automations react instantly in every org repository without hosting anything and without touching what the repositories own.

Plain rule:

- Each repository gets three thin `org-*.yml` callers (issue opened: add to the project; issue closed: set the Status, remove the blocking links). They carry a managed header and delegate to the engines in `.github`, pinned to the moving tag `v1`.
- One deploy job in `.github` keeps them in sync through one pull request per repository, plus the repo secret they need. It only reads, writes or deletes files named `org-*.yml` that carry the header; CI, deploy and build workflows are never touched, and a look-alike file without the header is reported, not overwritten.
- Manual runs are dry runs by default; the weekly run only reports drift. Rollout to the other repositories starts only on the owner's go.

Details: `docs/managed-workflows.md` and `actions/managed-deploy/README.md`.

