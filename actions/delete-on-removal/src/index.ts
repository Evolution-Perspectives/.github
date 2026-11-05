import { createDeps, input, main } from '../../../lib/runtime.ts'
import { deleteOnRemoval } from './delete.ts'

void main(async () => {
  await deleteOnRemoval(createDeps(input('token')), {
    projectId: input('project_id'),
    issueNodeId: input('issue_node_id'),
    itemNodeId: input('item_node_id'),
    eventAction: input('event_action'),
    sourceRepository: input('source_repository'),
    dryRun: input('dry_run') === 'true',
    debug: input('debug') === 'true'
  })
})
