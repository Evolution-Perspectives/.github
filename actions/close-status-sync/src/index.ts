import { createDeps, input, main } from '../../../lib/runtime.ts'
import { closeStatusSync } from './sync.ts'

void main(async () => {
  await closeStatusSync(createDeps(input('token')), {
    issueNodeId: input('issue_node_id'),
    stateReason: input('state_reason'),
    sourceRepository: input('source_repository'),
    projectId: input('project_id'),
    dryRun: input('dry_run') === 'true',
    debug: input('debug') === 'true'
  })
})
