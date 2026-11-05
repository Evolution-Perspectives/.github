import { createDeps, input, main } from '../../../lib/runtime.ts'
import { parseConfig } from './config.ts'
import { sweep } from './sweep.ts'

void main(async () => {
  const deps = createDeps(input('token'))
  let config
  try {
    config = parseConfig({
      projectId: input('project_id'),
      dryRun: input('dry_run'),
      debug: input('debug'),
      maxWrites: input('max_writes'),
      recentMinutes: input('recent_minutes'),
      pauseMs: input('pause_ms'),
      closePauseMs: input('close_pause_ms')
    })
  } catch (error) {
    deps.core.setFailed(error instanceof Error ? error.message : String(error))
    return
  }
  await sweep(deps, config, { now: Date.now(), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) })
})
