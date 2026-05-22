## 1. Workflow Contract And Security

- [x] 1.1 Define reusable workflow inputs for `project_id`, `issue_node_id`, observability metadata, and dry-run/debug flags
- [x] 1.2 Require dedicated automation PAT secret for GraphQL deletion mutation
- [x] 1.3 Apply least-privilege workflow/job permissions and fail early on missing required inputs

## 2. Deletion Engine

- [x] 2.1 Implement issue lookup by node ID with node type discrimination
- [x] 2.2 Implement target-project membership verification before destructive action
- [x] 2.3 Implement GraphQL `deleteIssue` mutation execution for eligible issue nodes
- [x] 2.4 Implement no-op behavior for already-missing nodes and non-issue items

## 3. Observability And Safety

- [x] 3.1 Add workflow summary with status outcomes (`deleted`, `dry-run-no-delete`, `skipped-*`)
- [x] 3.2 Add debug logging mode that increases visibility without changing behavior
- [x] 3.3 Ensure manual dispatch defaults to dry-run for safer operator validation

## 4. Organization Packaging

- [x] 4.1 Add thin trigger workflow in `.github/workflows`
- [x] 4.2 Add matching organization workflow template YAML in `.github/workflow-templates`
- [x] 4.3 Add matching organization workflow template metadata JSON in `.github/workflow-templates`
- [x] 4.4 Verify reference integrity between trigger, reusable workflow, and template target path

## 5. Validation And Cleanup

- [ ] 5.1 Validate dry-run path in pilot repository with synthetic dispatch payload
- [ ] 5.2 Validate deletion path for one issue removed from project
- [ ] 5.3 Validate skip behavior when issue is still in project
- [ ] 5.4 Validate cleanup of any temporary test issues/items created for pilot execution
