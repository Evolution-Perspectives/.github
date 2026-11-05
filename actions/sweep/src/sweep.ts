// Weekly reconciliation of the org project: issue close state, Status and blocking links.
//
// One read of the whole project, then three stages over an in-memory snapshot:
//   close     open issues whose Status is Done / Pending Release / Canceled are closed (never reopened)
//   status    closed issues whose Status is not a closing one get their Status from the close reason
//   blocking  "blocked by" links whose blocker is closed are removed
// Every write is planned first against a copy, the total is compared to the cap, and only then applied.
import type { Deps } from '../../../lib/types.ts'
import { runStages, type Clock } from './execute.ts'
import type { Config, StagePlan } from './model.ts'
import { STATUS, describeWrite, planAll, statusOptionId } from './plan.ts'
import { readSnapshot } from './read.ts'
import { writeSummary } from './summary.ts'

export async function sweep({ graphql, core }: Deps, config: Config, clock: Clock): Promise<void> {
  let snapshot
  try {
    snapshot = await readSnapshot(graphql, config.projectId)
    // Fail before any write when a required Status option is missing.
    for (const name of [STATUS.done, STATUS.canceled, STATUS.pendingRelease]) statusOptionId(snapshot, name)
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error))
    return
  }
  core.info(`Read ${snapshot.items.length} issue item(s) from project ${config.projectId}.`)

  const ctx = { now: clock.now, recentMs: config.recentMs }
  const planned: StagePlan[] = planAll(snapshot, ctx)
  const total = planned.reduce((n, stage) => n + stage.writes.length, 0)
  const overCap = total > config.maxWrites
  const noOutcome = { applied: {}, failed: [] }

  if (overCap) {
    const message = `Planned ${total} write(s), above the cap of ${config.maxWrites}.`
    if (config.dryRun) core.warning(`${message} A real run would refuse to write.`)
    else core.setFailed(`${message} Nothing was written; review the summary or raise max_writes.`)
    await writeSummary(core, { config, snapshot, stages: planned, ...noOutcome, overCap, total })
    return
  }

  if (config.dryRun) {
    for (const stage of planned) for (const write of stage.writes) core.info(`[dry-run] Would ${describeWrite(write)}`)
    await writeSummary(core, { config, snapshot, stages: planned, ...noOutcome, overCap: false, total })
    return
  }

  const outcome = await runStages(graphql, snapshot, config, clock, (m) => core.info(m), (m) => core.warning(m))
  await writeSummary(core, { config, snapshot, stages: outcome.stages, applied: outcome.applied, failed: outcome.failed, overCap: false, total })
  if (outcome.failed.length > 0) core.setFailed(`${outcome.failed.length} write(s) failed.`)
}
