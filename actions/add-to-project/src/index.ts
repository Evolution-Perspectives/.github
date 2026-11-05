import { createDeps, input, main } from '../../../lib/runtime.ts'
import { addToProject } from './add.ts'

void main(async () => {
  await addToProject(createDeps(input('token')), {
    projectId: input('project_id'),
    issueNodeId: input('issue_node_id'),
    issueNumber: input('issue_number'),
    sourceRepository: input('source_repository'),
    dryRun: input('dry_run') === 'true',
    debug: input('debug') === 'true',
    statusName: input('status_name')
  })
})
