// The only module that touches @actions/core and @actions/github at run time. Imported by each
// action's index.ts, never by the logic modules, so tests do not need the network libraries.
import * as core from '@actions/core'
import * as github from '@actions/github'
import { retrying } from './retry.ts'
import type { Deps } from './types.ts'

/** Builds the dependencies of an action from its `token` input. */
export function createDeps(token: string): Deps {
  const octokit = github.getOctokit(token)
  const graphql = retrying((query, variables) => octokit.graphql(query, variables) as never)
  return { graphql, core }
}

/** Reads a string input, trimmed, empty when absent. */
export const input = (name: string): string => core.getInput(name)

/** Runs an action entry point and reports an unexpected exception as a failure. */
export async function main(run: () => Promise<void>): Promise<void> {
  try {
    await run()
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
  }
}
