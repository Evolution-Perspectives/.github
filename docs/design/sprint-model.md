# Sprint model

Decisions for planning and tracking work in the org Project "Projets Digitaux".
Structure and IDs of the project are in `docs/project-schema/`.

## Cadence

- One iteration field, `Sprint`, **Friday to Thursday** (7 days).
- Thursday morning: tests, reviews and validation of the current sprint, then planning of the next one.
- Thursday afternoon: work on the next sprint starts. By date it still falls in the old iteration; use the `@next` view until Friday.
- An iteration is a **commitment**: "what can be done this week (done, tested, validated)". It is not a schedule.
- Iterations are a finite list. Anything that edits them must keep every existing `id`, including completed ones, or item assignments are wiped (see the iterations study).

## What goes in a sprint

- Only leaf issues. Parents never carry a sprint.
- Wait trackers (types `Externe`, `Management/Direction`) have no estimate and no sprint.
- `Support` and `Métier` are normal work types and are planned like any other. `Métier` is work done by company staff without a GitHub account; the assignee is the person who follows it.

## Review

- Normal work is reviewed inside its own issue: the developer moves it to `🧪 In Review`, it is validated at the Thursday meeting, then closed.
- Type `Test/Validation` is for bigger work only: user-facing, risky, multi-person, or with its own checklist.
- A failed validation opens a new `Bug`/rework issue instead of reopening.

## Issue types

- `Développement/Production` is retired: merged into `Tâche` (52 issues retyped on 2026-11-03). The new-page automation creates `Tâche`.
- `Externe` (waiting on an outside party) and `Management/Direction` (waiting on a decision) are wait trackers. Link them with "blocked by"; no estimate, no sprint.
- `Support` is real support work (user assistance, quick fixes), not a blocker.
- `Métier` is real work done by company staff without a GitHub account. It can also block other work.
- Keep `Projet` as the only level marker.

## Planning and deadlines

- Plan the whole project upfront by placing leaves in future sprints. A parent's deadline is the end of the latest sprint among its descendants.
- Hours/days estimates and the capacity scheduler are not part of this model.
