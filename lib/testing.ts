// Typed fakes used by the tests of every action. Not part of any bundle.
import type { CoreLike, GraphQL } from './types.ts'

export interface FakeLogs {
  info: string[]
  warning: string[]
  failed: string[]
  summary: string[]
  secrets: string[]
}

export interface Mutation {
  query: string
  vars: Record<string, unknown>
}

export interface Fakes {
  graphql: GraphQL
  core: CoreLike
  mutations: Mutation[]
  logs: FakeLogs
}

export type QueryHandler = (query: string, vars: Record<string, unknown>) => unknown
export type MutationHandler = (query: string, vars: Record<string, unknown>) => unknown

const isMutation = (query: string): boolean => /^\s*mutation\b/.test(query)

/**
 * Fake GraphQL client and core. Queries are answered by `onQuery`; mutations are recorded and
 * answered by `onMutation` (default `{}`). A handler may throw to simulate an API failure.
 */
export function fakes(onQuery: QueryHandler, onMutation: MutationHandler = () => ({})): Fakes {
  const mutations: Mutation[] = []
  const logs: FakeLogs = { info: [], warning: [], failed: [], summary: [], secrets: [] }
  const summary = {
    addHeading() { return summary },
    addEOL() { return summary },
    addRaw(text: string) { logs.summary.push(text); return summary },
    async write() {}
  }
  const core: CoreLike = {
    info: (m) => { logs.info.push(m) },
    warning: (m) => { logs.warning.push(m) },
    setFailed: (m) => { logs.failed.push(m) },
    setSecret: (m) => { logs.secrets.push(m) },
    summary
  }
  const graphql = (async (query: string, vars: Record<string, unknown> = {}) => {
    if (isMutation(query)) {
      const result = onMutation(query, vars)
      mutations.push({ query, vars })
      return result
    }
    return onQuery(query, vars)
  }) as GraphQL
  return { graphql, core, mutations, logs }
}
