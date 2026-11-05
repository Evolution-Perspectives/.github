// Reads the whole project once into a snapshot.
import type { GraphQL } from '../../../lib/types.ts'
import type { Issue, Item, Snapshot, StatusField } from './model.ts'

interface StatusFieldResult {
  node?: { field?: { id?: string; options?: { id: string; name: string }[] } | null } | null
}

interface ItemsResult {
  node?: {
    items?: {
      pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
      nodes?: {
        id: string
        updatedAt: string
        fieldValueByName?: { name?: string } | null
        content?: {
          __typename?: string
          id: string
          number: number
          state: string
          stateReason?: string | null
          updatedAt: string
          repository: { nameWithOwner: string }
          blockedBy?: {
            pageInfo?: { hasNextPage?: boolean }
            nodes?: { id: string; number: number; state: string; repository: { nameWithOwner: string } }[]
          }
        } | null
      }[]
    }
  } | null
}

const STATUS_FIELD_QUERY = `
  query($projectId: ID!) {
    node(id: $projectId) {
      ... on ProjectV2 {
        field(name: "Status") {
          ... on ProjectV2SingleSelectField {
            id
            options { id name }
          }
        }
      }
    }
  }
`

const ITEMS_QUERY = `
  query($projectId: ID!, $after: String) {
    node(id: $projectId) {
      ... on ProjectV2 {
        items(first: 100, after: $after) {
          pageInfo { hasNextPage endCursor }
          nodes {
            id
            updatedAt
            fieldValueByName(name: "Status") {
              ... on ProjectV2ItemFieldSingleSelectValue { name }
            }
            content {
              __typename
              ... on Issue {
                id
                number
                state
                stateReason
                updatedAt
                repository { nameWithOwner }
                blockedBy(first: 50) {
                  pageInfo { hasNextPage }
                  nodes {
                    id
                    number
                    state
                    repository { nameWithOwner }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`

export async function readStatusField(graphql: GraphQL, projectId: string): Promise<StatusField> {
  const res = await graphql<StatusFieldResult>(STATUS_FIELD_QUERY, { projectId })
  const field = res?.node?.field
  if (!field?.id) throw new Error(`Status field not found in project ${projectId}.`)
  const options: Record<string, string> = {}
  for (const option of field.options ?? []) options[option.name] = option.id
  return { id: field.id, options }
}

/** Reads every issue-backed item of the project (drafts and pull requests are ignored). */
export async function readSnapshot(graphql: GraphQL, projectId: string): Promise<Snapshot> {
  const statusField = await readStatusField(graphql, projectId)
  const items: Item[] = []
  const truncated: string[] = []
  let after: string | null = null
  for (;;) {
    const res: ItemsResult = await graphql<ItemsResult>(ITEMS_QUERY, { projectId, after })
    const page = res?.node?.items
    if (!page) throw new Error(`Project ${projectId} not found.`)
    for (const node of page.nodes ?? []) {
      const c = node.content
      if (c?.__typename !== 'Issue') continue
      const issue: Issue = {
        id: c.id,
        number: c.number,
        ref: `${c.repository.nameWithOwner}#${c.number}`,
        state: c.state,
        stateReason: c.stateReason ?? null,
        updatedAt: c.updatedAt,
        blockedBy: (c.blockedBy?.nodes ?? []).map((b) => ({ id: b.id, ref: `${b.repository.nameWithOwner}#${b.number}`, state: b.state }))
      }
      if (c.blockedBy?.pageInfo?.hasNextPage) truncated.push(issue.ref)
      items.push({ id: node.id, updatedAt: node.updatedAt, status: node.fieldValueByName?.name ?? null, issue })
    }
    if (!page.pageInfo?.hasNextPage) break
    after = page.pageInfo.endCursor ?? null
  }
  return { projectId, statusField, items, truncated }
}
