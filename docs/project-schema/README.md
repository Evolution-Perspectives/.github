# Project schema

Read-only snapshot of the structure of the org GitHub Project
**Projets Digitaux** (`Evolution-Perspectives` project #2).

GitHub is the source of truth. These files are a cached copy used as a
lookup (field IDs, option IDs, issue types, views) when writing or
reviewing automations, and to detect drift. **Do not edit by hand**, and
do not import them from workflows at runtime: actions must resolve IDs
live so a stale file can never break production.

| File | Content |
|---|---|
| `project.json` | Project node ID, number, title, URL |
| `fields.json` | Every field: name, ID, `dataType` (display order kept) |
| `options/<field>.json` | One file per single- or multi-select field (Status, Prio, Entity, Projet, Charge, Fiabilite, Périmètre, Métier): field ID and options with IDs, in display order |
| `workflows.json` | Built-in project automations (Settings > Workflows) and whether each is enabled. Currently all disabled: this repo's Actions replace them |
| `issue-fields.json` | Org-level issue fields (distinct from project fields). Currently none |
| `users.json` | Org members: login, name, node ID, role (ADMIN/MEMBER). The people Assignees and Reviewers can point at. No emails |
| `teams.json` | Org teams: slug, name, node ID, privacy, parent, member logins. Empty until teams are created |
| `labels.json` | Labels (name, color, description) per repo in `repos.json` `withItems` |
| `milestones.json` | Milestones (title, state, due date) per repo in `withItems` |
| `iterations/<field>.json` | Iteration fields, if any are ever added |
| `issue-types.json` | Org issue types with IDs |
| `views.json` | Project views: layout, filter, visible fields, grouping, sort |
| `repos.json` | `linked`: repos attached in project settings (currently empty). `withItems`: repos that actually have items in the project. `itemTypes`: item types present (ISSUE, PULL_REQUEST, DRAFT_ISSUE) |

## Reference: what *can* exist

`reference/` is generated from GitHub's GraphQL schema (introspection), not
from the project. It describes the possible vocabulary, so you can see what
could be added without guessing:

| File | Content |
|---|---|
| `reference/enums.json` | Allowed values: field types (`ProjectV2CustomFieldType`, `ProjectV2FieldType`), view layouts, option colors, item types, roles, status-update states, issue field types... |
| `reference/inputs.json` | Exact shape of every input object used to create or change project structure (fields, options, views, iterations, issue types, issue fields), with `required` flags |
| `reference/mutations.json` | Every project, issue-type, issue-field, sub-issue, blocked-by, label and milestone mutation, with its input type |

It only changes when GitHub changes its API, so a diff there is a signal that
new capabilities (or deprecations) appeared.

## Refresh

```bash
node .github/scripts/refresh-project-schema.js           # rewrite files
node .github/scripts/refresh-project-schema.js --check   # exit 1 on drift
```

Needs `gh` authenticated with `read:project` and `read:org` (locally, your
`gh auth login`; in CI, `EP_AUTOMATION_PAT`).

The `Refresh Project Schema` workflow runs weekly and on demand. When the
project changed, it opens (or updates) a PR on the branch
`chore/project-schema-refresh`. A schema PR is also an early warning: a
renamed or removed option may affect automations that reference it.

## Not covered on purpose

- **Items and their field values**: change constantly; query live when needed.
- **Access (project collaborators, per-project roles)**: sensitive and needs admin scope.
- **Repo custom properties**: no automation here depends on them.
