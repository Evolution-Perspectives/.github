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
- Blocker stand-ins (types `Externe`, `Support`, `Métier`, `Management/Direction`) have no estimate and no sprint.

## Review

- Normal work is reviewed inside its own issue: the developer moves it to `🧪 In Review`, it is validated at the Thursday meeting, then closed.
- Type `Test/Validation` is for bigger work only: user-facing, risky, multi-person, or with its own checklist.
- A failed validation opens a new `Bug`/rework issue instead of reopening.

## Issue types

- `Développement/Production` is retired: merged into `Tâche` (52 issues retyped on 2026-11-03). The new-page automation creates `Tâche`.
- `Externe`, `Support`, `Métier`, `Management/Direction` mark something blocking whose details live outside the project. Link with "blocked by", no estimate, no sprint.
- Keep `Projet` as the only level marker.

## Planning and deadlines

- Plan the whole project upfront by placing leaves in future sprints. A parent's deadline is the end of the latest sprint among its descendants.
- Hours/days estimates and the capacity scheduler are not part of this model.
