// The run summary published on the job page.
import type { CoreLike } from '../../../lib/types.ts'
import type { Failure } from './execute.ts'
import type { Config, Snapshot, StageName, StagePlan } from './model.ts'
import { describeWrite } from './plan.ts'

export interface SummaryData {
  config: Config
  snapshot: Snapshot
  stages: StagePlan[]
  applied: Partial<Record<StageName, number>>
  failed: Failure[]
  overCap: boolean
  total: number
}

export function writeSummary(core: CoreLike, data: SummaryData): Promise<unknown> {
  const { config, snapshot, stages, applied, failed, overCap, total } = data
  const s = core.summary.addHeading('Project sweep')
  s.addRaw(config.dryRun ? 'Mode: DRY RUN, nothing was written' : 'Mode: write').addEOL()
  s.addRaw(`Items read: ${snapshot.items.length}`).addEOL()
  s.addRaw(`Planned writes: ${total} (cap ${config.maxWrites})${overCap ? ' - OVER THE CAP' + (config.dryRun ? '' : ', nothing written') : ''}`).addEOL()
  const verb = config.dryRun || overCap ? 'planned' : 'applied'
  for (const stage of stages) {
    const count = verb === 'applied' ? (applied[stage.name] ?? 0) : stage.writes.length
    const failures = failed.filter((f) => f.stage === stage.name).length
    s.addRaw(`Stage ${stage.name}: ${verb} ${count} / planned ${stage.writes.length}, failed ${failures}, skipped ${stage.skipped.length}`).addEOL()
    for (const write of stage.writes) s.addRaw(`- ${describeWrite(write)}`).addEOL()
    for (const skipped of stage.skipped) s.addRaw(`- skipped ${skipped.ref}: ${skipped.reason}`).addEOL()
  }
  const mismatches = stages.flatMap((stage) => stage.mismatches)
  if (mismatches.length > 0) {
    s.addRaw(`Mismatches needing a human: ${mismatches.length}`).addEOL()
    for (const m of mismatches) s.addRaw(`- ${m.ref}: Status ${m.status} but closed as ${m.reason}`).addEOL()
  }
  if (snapshot.truncated.length > 0) {
    s.addRaw(`Issues with more than 50 blockers (only the first 50 were checked): ${snapshot.truncated.join(', ')}`).addEOL()
  }
  if (failed.length > 0) {
    s.addRaw(`Failures: ${failed.length}`).addEOL()
    for (const f of failed) s.addRaw(`- ${f.stage}: ${f.what}: ${f.message}`).addEOL()
  }
  return s.write()
}
