import { createDeps, input, main } from '../../../lib/runtime.ts'
import { cleanup } from './cleanup.ts'

void main(async () => {
  await cleanup(createDeps(input('token')), {
    issueNodeId: input('issue_node_id'),
    sourceRepository: input('source_repository'),
    dryRun: input('dry_run') === 'true',
    debug: input('debug') === 'true'
  })
})
