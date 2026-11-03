# Project Rollup Use Cases

## Use Case 1 - How Hours Are Calculated Today

Goal: Keep parent issue hours always synchronized with child issues.

Plain rule:

- For any parent item, Estimate Hours = sum of its children Estimate Hours.
- Only lowest-level child items are estimated by users.
- Parent estimates are always computed by automation.

How it works:

1. The workflow loads items from the configured GitHub Project V2.
2. It keeps only issue-backed items.
3. It builds the parent-child hierarchy from sub-issues.
4. For each leaf issue:

- Estimate Hours is read from the estimate field (or treated as 0 when empty).

5. For each parent issue:

- Parent Estimate Hours equals the sum of all child estimate hours in its hierarchy.
- A parent manual value is not kept when children exist, because parent values are derived from children.

6. The workflow writes changes only when values are different from current values.
7. If the run is dry-run, it computes everything but does not write updates.

Simple example:

- Child A estimate: 3h
- Child B estimate: 5h
- Parent estimate after rollup: 8h

Formula:

- EstimateHours(parent) = Sum(EstimateHours(children))

Notes:

- Only items present in the same project are included in the rollup graph.
- Strict mode impacts forecast completeness behavior when estimate values are missing.

---

## Use Case 2 - What Happens When an Item Has No Children (Leaf Item)

Goal: Let users freely set the estimate on leaf items without automation interfering.

Plain rule:

- A leaf item is any issue that has no sub-issues in the project.
- The automation never touches leaf item estimates.
- Only a human sets the estimate on a leaf item.

How it works:

1. The workflow builds the full parent-child hierarchy.
2. For every item, it checks whether that item has any children in the project.
3. If the item has no children, the automation skips it entirely.
4. The user-entered estimate value stays exactly as the user left it.
5. If the item does have children, the automation takes over and computes the value (Use Case 1).

Simple example:

- Story A has no sub-issues → user sets Estimate Hours to 5h → automation leaves it at 5h.
- Story B has sub-issues → automation sets Estimate Hours to the sum of its children → user manual value is replaced.

Notes:

- Leaf status is evaluated at runtime. If a user adds sub-issues to a previously-leaf item, the next run will treat it as a parent and start computing its value.
- If a leaf item has no estimate entered by the user, it is treated as 0h when computing its parent rollup.

---

## Use Case 3 - What Happens to Project Status When an Issue Is Closed

Goal: Clarify how closing a GitHub issue relates to the Project Status field.

Plain rule:

- Closing an issue (via UI, `gh issue close`, commit keyword, PR merge, or API) automatically sets the Project Status field, based on `state_reason`.
- Setting the Project Status field to `🏆 Done`, `📤 Pending Release` or `❌ Canceled` automatically closes the linked issue, and moving a closed issue's Status to any other option automatically reopens it.
- `📤 Pending Release` means the team's work is finished (reviewed, on staging) and only the release is left. The issue is closed so progress and burn-up count it; `🏆 Done` then means released.
- `📡 Pending Deploy` is an open state: the issue stays open (a closed issue moved there is reopened).
- Both directions are idempotent reconciles: no write happens if the issue/Status are already in the target state, so the two directions do not loop off each other.

How it works:

1. `close-issue-sync-status.yml` fires on `issues: closed` for every close and reads `state_reason`:
   - `completed` → Status `🏆 Done`, except: closed while in `🧪 In Review` → Status `📤 Pending Release`; already in `📤 Pending Release` → Status kept
   - `not_planned` or `duplicate` → Status `❌ Canceled`
2. `status-sync-issue-close.yml` fires on the org-level `projects-v2-item-updated` relay (the same relay `projects-estimation-rollup.yml` consumes) whenever a Project item's fields change, and reconciles the linked issue's close state against the current Status:
   - Status `🏆 Done` → issue closed as `completed`
   - Status `📤 Pending Release` → issue closed as `completed` (an already closed issue is left alone, whatever its close reason)
   - Status `❌ Canceled` → issue closed as `not_planned`
   - Any other Status, while the linked issue is closed → issue reopened
   - Project items with no linked issue (drafts, PRs) are skipped
3. `remove-blocking-on-close.yml` still fires independently on `issues: closed` and removes blocking-relationship edges pointing from the closed issue.

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
- Closing an issue also removes its blocking links (`remove-blocking-on-close.yml`), so dependents are unblocked when an item reaches `📤 Pending Release`, not when it is released.
