// Shared test helper: runs the close-state-sync action on a fake project item.
import { fakes } from '../../../lib/testing.ts'
import { closeStateSync, type Inputs } from './sync.ts'

export const PROJECT = 'PVT_kwDOtestproject'

interface Opts {
  status: string | null
  state?: string
  stateReason?: string | null
  typename?: string
  project?: string
  content?: unknown
}

function handler({ status, state, stateReason = null, typename = 'ProjectV2Item', project = PROJECT, content }: Opts) {
  return () => ({
    node: {
      __typename: typename,
      id: 'PVTI_item1',
      project: { id: project },
      fieldValueByName: status ? { optionId: 'x', name: status } : null,
      content: content !== undefined ? content : {
        __typename: 'Issue',
        id: 'I_issue1',
        number: 7,
        state,
        stateReason,
        repository: { nameWithOwner: 'org/repo' }
      }
    }
  })
}

const baseInputs: Inputs = { projectId: PROJECT, itemNodeId: 'PVTI_item1', sourceRepository: 'org/repo', dryRun: false, debug: false }

/** Runs the action on a project item with the given Status and issue state. */
export async function statusSync(opts: Opts, inputs: Partial<Inputs> = {}) {
  const f = fakes(handler(opts))
  await closeStateSync(f, { ...baseInputs, ...inputs })
  const results = f.logs.summary.map((l) => /^Result: (.+)$/.exec(l)?.[1]).filter((r): r is string => Boolean(r))
  return { mutations: f.mutations, logs: f.logs, results }
}

