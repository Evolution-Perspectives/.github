// Permanently deletes an issue that was removed from the project, only when the issue is
// confirmed to be out of the project.
import type { Deps } from '../../../lib/types.ts'
import { isNodeId, isSourceRepositoryValid } from '../../../lib/validate.ts'

export interface Inputs {
  projectId: string
  issueNodeId: string
  itemNodeId: string
  eventAction: string
  sourceRepository: string
  dryRun: boolean
  debug: boolean
}

interface ProjectItemRef {
  id?: string
  project?: { id?: string; number?: number; title?: string } | null
}

interface LookupResult {
  node?: {
    __typename?: string
    id?: string
    number?: number
    title?: string
    state?: string
    repository?: { nameWithOwner: string }
    projectItems?: { pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }; nodes?: ProjectItemRef[] }
  } | null
}

const LOOKUP_QUERY = `
  query($id: ID!, $after: String) {
    node(id: $id) {
      __typename
      ... on Issue {
        id
        number
        title
        state
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
              number
              title
            }
          }
        }
      }
    }
  }
`

const DELETE_MUTATION = `
  mutation($issueId: ID!) {
    deleteIssue(input: { issueId: $issueId }) {
      clientMutationId
    }
  }
`

export async function deleteOnRemoval({ graphql, core }: Deps, inputs: Inputs): Promise<void> {
  const { projectId, issueNodeId, itemNodeId, eventAction, sourceRepository, dryRun, debug } = inputs

  if (!projectId || !issueNodeId || issueNodeId === 'null' || issueNodeId === 'undefined') {
    core.setFailed('Missing required inputs: project_id and issue_node_id are required.')
    return
  }

  // Inputs may come from repository_dispatch payloads or manual runs: validate
  // their shape before they reach any GraphQL call.
  if (!isNodeId(projectId) || !isNodeId(issueNodeId) || (itemNodeId && !isNodeId(itemNodeId))) {
    core.setFailed('Malformed node ID in inputs (project_id, issue_node_id, or item_node_id does not match expected node ID shape).')
    return
  }
  if (!isSourceRepositoryValid(sourceRepository)) {
    core.setFailed(`Malformed source_repository input: "${sourceRepository}".`)
    return
  }

  const writeSummary = (status: string, issueRef: string | null, extra: Record<string, string> = {}) => {
    const summary = core.summary.addHeading('Project removal issue deletion')
    if (issueRef) summary.addRaw(`Issue: ${issueRef}`).addEOL()
    summary.addRaw(`Project ID: ${projectId}`).addEOL()
    summary.addRaw(`Issue node ID: ${issueNodeId}`).addEOL()
    for (const [key, value] of Object.entries(extra)) summary.addRaw(`${key}: ${value}`).addEOL()
    summary.addRaw(`Status: ${status}`).addEOL()
    summary.addRaw(`Source action: ${eventAction}`).addEOL()
    summary.addRaw(`Source repository: ${sourceRepository}`).addEOL()
    return summary.write()
  }

  let issue: NonNullable<LookupResult['node']> | null = null
  const projectItems: ProjectItemRef[] = []
  let after: string | null = null

  for (;;) {
    let res: LookupResult
    try {
      res = await graphql<LookupResult>(LOOKUP_QUERY, { id: issueNodeId, after })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.toLowerCase().includes('could not resolve to a node')) {
        core.warning(`Issue node ${issueNodeId} is already missing. Assuming previously deleted.`)
        await writeSummary('already-missing', null)
        return
      }
      throw error
    }

    const node = res?.node
    if (!node) {
      core.warning(`No node found for ${issueNodeId}. Assuming deleted.`)
      await writeSummary('already-missing', null)
      return
    }

    const nodeType = node.__typename ?? 'Unknown'
    if (nodeType !== 'Issue') {
      core.warning(`Node ${issueNodeId} is type ${nodeType}; deletion skipped.`)
      await writeSummary('skipped-non-issue', null, { 'Node type': nodeType })
      return
    }

    issue = node
    projectItems.push(...(node.projectItems?.nodes ?? []))
    const pageInfo = node.projectItems?.pageInfo
    if (!pageInfo?.hasNextPage) break
    after = pageInfo.endCursor ?? null
  }

  if (!issue?.repository || !issue.id) {
    core.setFailed(`Unexpected response for ${issueNodeId}: missing repository or id.`)
    return
  }

  const issueRef = `${issue.repository.nameWithOwner}#${issue.number}`
  const stillInTargetProject = projectItems.some((item) => item?.project?.id === projectId)

  if (debug) {
    core.info(`Source action: ${eventAction}`)
    core.info(`Source repository: ${sourceRepository}`)
    core.info(`Item node ID: ${itemNodeId || 'n/a'}`)
    core.info(`Resolved issue: ${issueRef}`)
    core.info(`Discovered project item entries on issue: ${projectItems.length}`)
  }

  if (stillInTargetProject) {
    core.warning(`Issue ${issueRef} is still attached to project ${projectId}; deletion skipped.`)
    await writeSummary('skipped-still-in-project', issueRef)
    return
  }

  if (dryRun) {
    core.info(`[dry-run] Would delete issue ${issueRef}.`)
    await writeSummary('dry-run-no-delete', issueRef)
    return
  }

  await graphql(DELETE_MUTATION, { issueId: issue.id })
  core.info(`Deleted issue ${issueRef}.`)
  await writeSummary('deleted', issueRef)
}
