import { createDeps, input, main } from '../../../lib/runtime.ts'
import { closeStateSync } from './sync.ts'

void main(async () => {
  await closeStateSync(createDeps(input('token')), {
    projectId: input('project_id'),
    itemNodeId: input('item_node_id'),
    sourceRepository: input('source_repository'),
    dryRun: input('dry_run') === 'true',
    debug: input('debug') === 'true'
  })
})
