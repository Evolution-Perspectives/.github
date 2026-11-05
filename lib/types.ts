// Minimal structural types shared by every action. Real implementations come from
// @actions/core and @actions/github (see runtime.ts); tests use the fakes of testing.ts.

export type GraphQL = <T = unknown>(query: string, variables?: Record<string, unknown>) => Promise<T>

export interface SummaryLike {
  addHeading(text: string, level?: number): SummaryLike
  addRaw(text: string, addEOL?: boolean): SummaryLike
  addEOL(): SummaryLike
  write(): Promise<unknown>
}

export interface CoreLike {
  info(message: string): void
  warning(message: string): void
  setFailed(message: string): void
  summary: SummaryLike
}

export interface Deps {
  graphql: GraphQL
  core: CoreLike
}
