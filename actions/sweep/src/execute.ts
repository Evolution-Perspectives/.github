// Applies planned writes through the API, one at a time, isolating failures.
import type { GraphQL } from '../../../lib/types.ts'
import type { Config, PlanContext, Snapshot, StageName, StagePlan, Write } from './model.ts'
import { STAGES, applyWrite, describeWrite } from './plan.ts'

const CLOSE_MUTATION = `
  mutation($issueId: ID!, $reason: IssueClosedStateReason!) {
    closeIssue(input: { issueId: $issueId, stateReason: $reason }) { clientMutationId }
  }
`

const STATUS_MUTATION = `
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId, itemId: $itemId, fieldId: $fieldId,
      value: { singleSelectOptionId: $optionId }
    }) { projectV2Item { id } }
  }
`

const UNBLOCK_MUTATION = `
  mutation($issueId: ID!, $blockingIssueId: ID!) {
    removeBlockedBy(input: { issueId: $issueId, blockingIssueId: $blockingIssueId }) { clientMutationId }
  }
`

export interface Failure {
  stage: StageName
  what: string
  message: string
}

export interface RunOutcome {
  stages: StagePlan[]
  applied: Record<StageName, number>
  failed: Failure[]
}

export async function executeWrite(graphql: GraphQL, snapshot: Snapshot, write: Write): Promise<void> {
  switch (write.type) {
    case 'close':
      await graphql(CLOSE_MUTATION, { issueId: write.issueId, reason: write.reason })
      return
    case 'status':
      await graphql(STATUS_MUTATION, {
        projectId: snapshot.projectId,
        itemId: write.itemId,
        fieldId: snapshot.statusField.id,
        optionId: write.optionId
      })
      return
    case 'unblock':
      await graphql(UNBLOCK_MUTATION, { issueId: write.issueId, blockingIssueId: write.blockingIssueId })
      return
    default: {
      const unreachable: never = write
      throw new Error(`Unknown write ${JSON.stringify(unreachable)}`)
    }
  }
}

export interface Clock {
  now: number
  sleep: (ms: number) => Promise<void>
}

/**
 * Real run: each stage is re-planned from the real snapshot, so a write that failed never
 * cascades into work that depends on it. Successful writes patch the snapshot.
 */
export async function runStages(
  graphql: GraphQL,
  snapshot: Snapshot,
  config: Config,
  clock: Clock,
  log: (message: string) => void,
  warn: (message: string) => void
): Promise<RunOutcome> {
  const ctx: PlanContext = { now: clock.now, recentMs: config.recentMs }
  const applied: Record<StageName, number> = { close: 0, status: 0, blocking: 0 }
  const failed: Failure[] = []
  const stages: StagePlan[] = []
  let first = true
  for (const { name, plan } of STAGES) {
    const result = plan(snapshot, ctx)
    for (const write of result.writes) {
      if (!first) await clock.sleep(config.pauseMs)
      first = false
      try {
        await executeWrite(graphql, snapshot, write)
        applyWrite(snapshot, write)
        applied[name] += 1
        if (config.debug) log(`Done: ${describeWrite(write)}`)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        failed.push({ stage: name, what: describeWrite(write), message })
        warn(`Failed (${describeWrite(write)}): ${message}`)
      }
    }
    stages.push({ name, ...result })
  }
  return { stages, applied, failed }
}
