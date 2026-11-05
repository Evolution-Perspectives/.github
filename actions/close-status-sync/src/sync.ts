// Sets the project Status from the way an issue was closed.
import type { Deps } from '../../../lib/types.ts'
import { isMissing, isNodeId, isSourceRepositoryValid } from '../../../lib/validate.ts'

export interface Inputs {
  issueNodeId: string
  stateReason: string
  sourceRepository: string
  projectId: string
  dryRun: boolean
  debug: boolean
}

interface StatusFieldResult {
  node?: { field?: { id?: string; options?: { id: string; name: string }[] } | null } | null
}

interface ProjectItem {
  id: string
  project?: { id?: string } | null
  fieldValueByName?: { optionId?: string; name?: string } | null
}

interface IssuePage {
  node?: {
    __typename?: string
    id?: string
    number?: number
    repository?: { nameWithOwner: string }
    projectItems?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }; nodes?: ProjectItem[] }
  } | null
}

const DONE_STATUS = '🏆 Done'
const CANCELED_STATUS = '❌ Canceled'
const PENDING_RELEASE_STATUS = '📤 Pending Release'
const IN_REVIEW_STATUS = '🧪 In Review'

const TARGET_NAME_BY_REASON: Record<string, string> = {
  completed: DONE_STATUS,
  not_planned: CANCELED_STATUS,
  duplicate: CANCELED_STATUS
}

const STATUS_FIELD_QUERY = `
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options {
              id
              name
            }
          }
        }
      }
    }
  }
`

const ISSUE_QUERY = `
  query($id: ID!, $after: String) {
    node(id: $id) {
      __typename
      ... on Issue {
        id
        number
        repository {
          nameWithOwner
        }
        projectItems(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            project {
              id
            }
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue {
                optionId
                name
              }
            }
          }
        }
      }
    }
  }
`

const MUTATION = `
  mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $projectId,
      itemId: $itemId,
      fieldId: $fieldId,
      value: { singleSelectOptionId: $optionId }
    }) {
      clientMutationId
    }
  }
`

interface Target {
  name: string
  optionId: string
}

export async function closeStatusSync({ graphql, core }: Deps, inputs: Inputs): Promise<void> {
  const { issueNodeId, sourceRepository, projectId, dryRun, debug } = inputs
  const stateReason = inputs.stateReason.toLowerCase()

  if (isMissing(issueNodeId)) {
    core.setFailed('Missing required issue_node_id input.')
    return
  }
  if (!isNodeId(issueNodeId) || !isNodeId(projectId)) {
    core.setFailed('Malformed node ID in inputs (issue_node_id or project_id does not match expected node ID shape).')
    return
  }
  if (!isSourceRepositoryValid(sourceRepository)) {
    core.setFailed(`Malformed source_repository input: "${sourceRepository}".`)
    return
  }

  const writeSummary = (issueRef: string | null, status: string, extra: Record<string, string> = {}) => {
    const summary = core.summary
      .addHeading('Close issue → Status sync')
      .addRaw(`Issue: ${issueRef ?? issueNodeId}`)
      .addEOL()
      .addRaw(`Close reason: ${stateReason || 'unknown'}`)
      .addEOL()
      .addRaw(`Status: ${status}`)
      .addEOL()
      .addRaw(`Source repository: ${sourceRepository}`)
      .addEOL()
    for (const [key, value] of Object.entries(extra)) summary.addRaw(`${key}: ${value}`).addEOL()
    return summary.write()
  }

  const targetName = TARGET_NAME_BY_REASON[stateReason]
  if (!targetName) {
    core.warning(`Unrecognized close reason "${stateReason}" for issue ${issueNodeId}; no Status change applied.`)
    await writeSummary(null, 'skipped-unrecognized-reason')
    return
  }

  // Resolve the Status field and its options live, by name: no option IDs are stored here.
  const statusMeta = await graphql<StatusFieldResult>(STATUS_FIELD_QUERY, { projectId })
  const statusField = statusMeta?.node?.field
  const statusFieldId = statusField?.id ?? ''
  const optionIdByName = new Map((statusField?.options ?? []).map((o) => [o.name, o.id] as const))
  const missingStatuses = [DONE_STATUS, CANCELED_STATUS, PENDING_RELEASE_STATUS].filter((n) => !optionIdByName.has(n))
  if (!statusFieldId || missingStatuses.length > 0) {
    core.setFailed(`Status field or options not found in project ${projectId}: ${missingStatuses.join(', ') || 'Status field'}.`)
    return
  }

  const target: Target = { name: targetName, optionId: optionIdByName.get(targetName)! }
  const pendingReleaseTarget: Target = { name: PENDING_RELEASE_STATUS, optionId: optionIdByName.get(PENDING_RELEASE_STATUS)! }

  let issueRef = ''
  const projectItems: ProjectItem[] = []
  let after: string | null = null
  for (;;) {
    const res: IssuePage = await graphql<IssuePage>(ISSUE_QUERY, { id: issueNodeId, after })
    const node = res?.node
    if (!node || node.__typename !== 'Issue') {
      core.warning(`Node ${issueNodeId} is not an Issue (${node?.__typename ?? 'missing'}); skipping.`)
      await writeSummary(null, 'skipped-not-an-issue')
      return
    }
    issueRef = `${node.repository?.nameWithOwner}#${node.number}`
    projectItems.push(...(node.projectItems?.nodes ?? []))
    const pageInfo = node.projectItems?.pageInfo
    if (!pageInfo?.hasNextPage) break
    after = pageInfo.endCursor ?? null
  }

  const item = projectItems.find((entry) => entry?.project?.id === projectId)

  if (debug) {
    core.info(`Issue: ${issueRef}`)
    core.info(`Close reason: ${stateReason}`)
    core.info(`Target Status: ${target.name}`)
    core.info(`Project items found: ${projectItems.length}`)
  }

  if (!item) {
    core.info(`Issue ${issueRef} is not tracked on project ${projectId}; nothing to sync.`)
    await writeSummary(issueRef, 'skipped-not-in-project')
    return
  }

  const currentOptionId = item.fieldValueByName?.optionId
  const currentName = item.fieldValueByName?.name ?? '(none)'

  // A completed close does not always mean "released":
  // - already Pending Release: team work is finished, only the release is left; keep it.
  // - closed from In Review: reviewed, so it waits for the release (Pending Release).
  // - otherwise: Done.
  let effectiveTarget = target
  if (stateReason === 'completed') {
    if (currentName === PENDING_RELEASE_STATUS) {
      core.info(`${issueRef} is already ${PENDING_RELEASE_STATUS}; Status kept.`)
      await writeSummary(issueRef, 'skipped-keep-pending-release', { 'Current Status': currentName })
      return
    }
    if (currentName === IN_REVIEW_STATUS) effectiveTarget = pendingReleaseTarget
  }

  if (currentOptionId === effectiveTarget.optionId) {
    core.info(`Status already ${effectiveTarget.name} for ${issueRef}; no write needed.`)
    await writeSummary(issueRef, 'skipped-already-in-sync', { 'Current Status': currentName })
    return
  }

  if (dryRun) {
    core.info(`[dry-run] Would set Status of ${issueRef} from "${currentName}" to "${effectiveTarget.name}".`)
    await writeSummary(issueRef, 'dry-run-no-write', { 'Current Status': currentName, 'Target Status': effectiveTarget.name })
    return
  }

  await graphql(MUTATION, { projectId, itemId: item.id, fieldId: statusFieldId, optionId: effectiveTarget.optionId })

  core.info(`Set Status of ${issueRef} from "${currentName}" to "${effectiveTarget.name}".`)
  await writeSummary(issueRef, 'updated', { 'Previous Status': currentName, 'New Status': effectiveTarget.name })
}
