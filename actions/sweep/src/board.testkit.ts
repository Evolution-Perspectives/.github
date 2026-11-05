// A small stateful fake of the GitHub project: answers the sweep's reads and applies its writes,
// so tests can run the whole pipeline (and run it twice to check idempotence).
import type { GraphQL } from '../../../lib/types.ts'

export interface BoardIssue {
  id: string
  number: number
  repo?: string
  state: 'OPEN' | 'CLOSED'
  stateReason?: string | null
  updatedAt?: string
  blockedBy?: string[] // ids of blocking issues (in the board or in `external`)
}

export interface BoardItem {
  id: string
  issue: string // issue id
  status: string | null // Status option name
  updatedAt?: string
}

export interface BoardSpec {
  items: BoardItem[]
  issues: BoardIssue[]
  external?: { id: string; number: number; repo?: string; state: 'OPEN' | 'CLOSED' }[]
  options?: Record<string, string>
  pageSize?: number
  failOn?: (mutation: string, vars: Record<string, unknown>) => boolean
}

export const DEFAULT_OPTIONS: Record<string, string> = {
  '📦 Backlog': 'opt-backlog',
  '🌱 In Progress': 'opt-progress',
  '🧪 In Review': 'opt-review',
  '📤 Pending Release': 'opt-pending',
  '🏆 Done': 'opt-done',
  '❌ Canceled': 'opt-canceled'
}

const OLD = '2020-01-01T00:00:00Z'

type StoredIssue = Required<Omit<BoardIssue, 'stateReason'>> & { stateReason: string | null }

export interface Board {
  graphql: GraphQL
  issues: Map<string, StoredIssue>
  items: Map<string, BoardItem>
  mutations: { kind: string; vars: Record<string, unknown> }[]
  reads: number
}

export function makeBoard(spec: BoardSpec): Board {
  const options = spec.options ?? DEFAULT_OPTIONS
  const nameById = new Map(Object.entries(options).map(([name, id]) => [id, name] as const))
  const issues = new Map<string, StoredIssue>(
    spec.issues.map((i): [string, StoredIssue] => [i.id, { repo: 'org/app', stateReason: null, updatedAt: OLD, blockedBy: [], ...i }])
  )
  const items = new Map<string, BoardItem>(spec.items.map((i): [string, BoardItem] => [i.id, { updatedAt: OLD, ...i }]))
  const external = new Map((spec.external ?? []).map((e) => [e.id, { repo: 'org/app', ...e }] as const))
  const pageSize = spec.pageSize ?? 100
  const board: Board = { graphql: undefined as unknown as GraphQL, issues, items, mutations: [], reads: 0 }

  const blockerNode = (id: string) => {
    const inBoard = issues.get(id)
    if (inBoard) return { id, number: inBoard.number, state: inBoard.state, repository: { nameWithOwner: inBoard.repo } }
    const out = external.get(id)!
    return { id, number: out.number, state: out.state, repository: { nameWithOwner: out.repo } }
  }

  board.graphql = (async (query: string, vars: Record<string, unknown> = {}) => {
    if (/^\s*mutation\b/.test(query)) {
      if (spec.failOn?.(query, vars)) throw new Error('boom')
      if (/closeIssue/.test(query)) {
        const issue = issues.get(String(vars.issueId))!
        issue.state = 'CLOSED'
        issue.stateReason = String(vars.reason)
        board.mutations.push({ kind: 'close', vars })
      } else if (/updateProjectV2ItemFieldValue/.test(query)) {
        const item = items.get(String(vars.itemId))!
        item.status = nameById.get(String(vars.optionId)) ?? null
        board.mutations.push({ kind: 'status', vars })
      } else if (/removeBlockedBy/.test(query)) {
        const issue = issues.get(String(vars.issueId))!
        issue.blockedBy = issue.blockedBy.filter((b) => b !== vars.blockingIssueId)
        board.mutations.push({ kind: 'unblock', vars })
      } else {
        throw new Error(`unexpected mutation ${query}`)
      }
      return {}
    }
    if (/field\(name: "Status"\)/.test(query) && /options/.test(query)) {
      return { node: { field: { id: 'PVTSSF_status', options: Object.entries(options).map(([name, id]) => ({ id, name })) } } }
    }
    if (/items\(first/.test(query)) {
      board.reads++
      const all = [...items.values()]
      const start = vars.after ? Number(String(vars.after).replace('cursor-', '')) : 0
      const slice = all.slice(start, start + pageSize)
      const end = start + pageSize
      return {
        node: {
          items: {
            pageInfo: { hasNextPage: end < all.length, endCursor: `cursor-${end}` },
            nodes: slice.map((item) => {
              const issue = issues.get(item.issue)!
              return {
                id: item.id,
                updatedAt: item.updatedAt ?? OLD,
                fieldValueByName: item.status ? { name: item.status } : null,
                content: {
                  __typename: 'Issue',
                  id: issue.id,
                  number: issue.number,
                  state: issue.state,
                  stateReason: issue.stateReason,
                  updatedAt: issue.updatedAt,
                  repository: { nameWithOwner: issue.repo },
                  blockedBy: { pageInfo: { hasNextPage: false }, nodes: issue.blockedBy.map(blockerNode) }
                }
              }
            })
          }
        }
      }
    }
    throw new Error(`unexpected query ${query.slice(0, 60)}`)
  }) as GraphQL
  return board
}
