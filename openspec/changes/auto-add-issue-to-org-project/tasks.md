## 1. Reusable add-to-project workflow

- [x] 1.1 Create `.github/workflows/add-issue-to-org-project-action.yml` as a `workflow_call` reusable workflow with inputs: `project_id`, `issue_node_id`, `issue_number`, `source_repository`, `dry_run`, `debug`, and secret `automation_pat`
- [x] 1.2 Implement `actions/github-script` step: resolve the issue node, call `addProjectV2ItemById` unless `dry_run`, and write a `core.summary` report (status: added / already-present / dry-run)
- [x] 1.3 Set `runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}` and `permissions: contents: read` to match existing action workflows

## 2. Real-time trigger in this repo

- [x] 2.1 Create `.github/workflows/add-issue-to-org-project.yml` with `on: issues: types: [opened]`, calling `Evolution-Perspectives/.github/.github/workflows/add-issue-to-org-project-action.yml@main` with `project_id: PVT_kwDOCIcusc4BOGrD`, `issue_node_id: ${{ github.event.issue.node_id }}`, `source_repository: ${{ github.repository }}`, and `secrets.EP_AUTOMATION_PAT` (mirror `remove-blocking-on-close.yml`)

## 3. Org workflow template

- [x] 3.1 Create `.github/workflow-templates/add-issue-to-org-project.yml` with the same content as the local trigger (task 2.1)
- [x] 3.2 Create `.github/workflow-templates/add-issue-to-org-project.properties.json` (name, description, iconName, categories) matching the format of `remove-blocking-on-close.properties.json`

## 4. Validation (this repo)

- [ ] 4.1 Push workflows to a feature branch, run `add-issue-to-org-project-action.yml` via `workflow_dispatch` with `dry_run: true` against a real issue node ID; confirm summary output and no mutation
- [ ] 4.2 Create a disposable test issue, run the action with `dry_run: false`, confirm it appears as an item in the main org project
- [ ] 4.3 Delete the disposable test issue per validation cleanup policy
- [ ] 4.4 Merge to default branch; confirm opening a real issue in this repo adds it to the project automatically

## 5. Org-wide rollout (requires explicit confirmation before executing — cross-repo write)

- [ ] 5.1 Confirm with user: rollout mechanism (direct commit vs. PR per repo) and repo list scope
- [ ] 5.2 List all existing org repos (`gh repo list Evolution-Perspectives`)
- [ ] 5.3 Push `.github/workflows/add-issue-to-org-project.yml` (identical to the published template) to each repo, per the confirmed mechanism
- [ ] 5.4 Spot-check a handful of rolled-out repos by opening/closing a real or test issue and confirming project add
