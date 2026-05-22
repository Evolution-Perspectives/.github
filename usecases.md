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
