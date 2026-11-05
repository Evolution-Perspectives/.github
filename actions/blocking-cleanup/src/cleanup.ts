// Removes every blocking and blocked-by link of a just-closed issue.
import type { Deps } from '../../../lib/types.ts'
import { isMissing, isNodeId, isSourceRepositoryValid } from '../../../lib/validate.ts'

export interface Inputs {
  issueNodeId: string
  sourceRepository: string
  dryRun: boolean
  debug: boolean
}

type Field = 'blocking' | 'blockedBy'

interface IssueRef {
  id: string
  number: number
  title?: string
  state?: string
  repository: { nameWithOwner: string }
}

interface Connection {
  pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
  nodes?: IssueRef[]
}

interface IssueNode extends IssueRef {
  blocking?: Connection
  blockedBy?: Connection
}

interface QueryResult {
  node?: IssueNode | null
}

interface Edge {
  direction: 'blocks' | 'blocked-by'
  other: IssueRef
  issueId: string // the blocked issue
  blockingIssueId: string // the blocking issue
}

// The relationship field name is one of two fixed constants, never user input.
const buildQuery = (field: Field): string => `
  query($id: ID!, $after: String) {
    node(id: $id) {
      ... on Issue {
        id
        number
        title
        repository {
          nameWithOwner
        }
        ${field}(first: 100, after: $after) {
          pageInfo {
            hasNextPage
            endCursor
          }
          nodes {
            id
            number
            title
            state
            repository {
              nameWithOwner
            }
          }
        }
      }
    }
  }
`

const MUTATION = `
  mutation($issueId: ID!, $blockingIssueId: ID!) {
    removeBlockedBy(input: {
      issueId: $issueId,
      blockingIssueId: $blockingIssueId
    }) {
      clientMutationId
    }
  }
`

const refOf = (issue: IssueRef): string => `${issue.repository.nameWithOwner}#${issue.number}`

export async function cleanup({ graphql, core }: Deps, inputs: Inputs): Promise<void> {
  const { issueNodeId, sourceRepository, dryRun, debug } = inputs

  if (isMissing(issueNodeId)) {
    core.setFailed('Missing required issue_node_id input.')
    return
  }
  // Validate shapes before the values reach any GraphQL call.
  if (!isNodeId(issueNodeId)) {
    core.setFailed('Malformed issue_node_id input (does not match expected node ID shape).')
    return
  }
  if (!isSourceRepositoryValid(sourceRepository)) {
    core.setFailed(`Malformed source_repository input: "${sourceRepository}".`)
    return
  }

  // Reads every page of one relationship list.
  const fetchEdges = async (field: Field): Promise<{ issue: IssueNode | null; nodes: IssueRef[] }> => {
    const query = buildQuery(field)
    const nodes: IssueRef[] = []
    let after: string | null = null
    for (;;) {
      const res: QueryResult = await graphql<QueryResult>(query, { id: issueNodeId, after })
      const issue = res?.node ?? null
      if (!issue) return { issue: null, nodes }
      nodes.push(...(issue[field]?.nodes ?? []))
      const pageInfo = issue[field]?.pageInfo
      if (!pageInfo?.hasNextPage) return { issue, nodes }
      after = pageInfo.endCursor ?? null
    }
  }

  const blockingResult = await fetchEdges('blocking')
  if (!blockingResult.issue) {
    core.setFailed(`No issue found for node ID ${issueNodeId}.`)
    return
  }
  const blockedByResult = await fetchEdges('blockedBy')

  const closedIssue = blockingResult.issue
  const closedIssueRef = refOf(closedIssue)

  // Each edge: which issue is blocked (issueId) and which blocks it (blockingIssueId).
  const edges: Edge[] = [
    ...blockingResult.nodes.map((other): Edge => ({ direction: 'blocks', other, issueId: other.id, blockingIssueId: closedIssue.id })),
    ...blockedByResult.nodes.map((other): Edge => ({ direction: 'blocked-by', other, issueId: closedIssue.id, blockingIssueId: other.id }))
  ]

  const discovered = `Discovered edges: ${edges.length} (blocks ${blockingResult.nodes.length}, blocked-by ${blockedByResult.nodes.length})`
  core.info(`Closed issue: ${closedIssueRef}`)
  core.info(`Source repository input: ${sourceRepository}`)
  core.info(discovered)

  let removed = 0
  let planned = 0
  const failedEdges: { label: string; message: string }[] = []

  for (const edge of edges) {
    const otherRef = refOf(edge.other)
    const label = edge.direction === 'blocks' ? `${closedIssueRef} blocks ${otherRef}` : `${closedIssueRef} blocked by ${otherRef}`

    if (dryRun) {
      planned += 1
      core.info(`[dry-run] Would remove edge: ${label}`)
      continue
    }

    try {
      await graphql(MUTATION, { issueId: edge.issueId, blockingIssueId: edge.blockingIssueId })
      removed += 1
      if (debug) core.info(`Removed edge: ${label}`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      failedEdges.push({ label, message })
      core.warning(`Failed to remove edge (${label}): ${message}`)
    }
  }

  core.summary
    .addHeading('Issue dependency cleanup')
    .addRaw(`Closed issue: ${closedIssueRef}`)
    .addEOL()
    .addRaw(discovered)
    .addEOL()
    .addRaw(dryRun ? `Dry run: nothing removed, ${planned} edge(s) would be removed` : `Removed edges: ${removed}`)
    .addEOL()
    .addRaw(`Failed edges: ${failedEdges.length}`)
    .addEOL()

  if (failedEdges.length > 0) {
    core.summary.addEOL().addHeading('Failed edge removals', 2)
    for (const entry of failedEdges) core.summary.addRaw(`- ${entry.label}: ${entry.message}`).addEOL()
  }

  await core.summary.write()
}
