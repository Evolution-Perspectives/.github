// Turns the raw action inputs into a validated configuration.
import type { Config } from './model.ts'
import { isNodeId } from '../../../lib/validate.ts'

export interface RawInputs {
  projectId: string
  dryRun: string
  debug: string
  maxWrites: string
  recentMinutes: string
  pauseMs: string
  closePauseMs?: string
}

const toNumber = (value: string, fallback: number): number => (value === '' ? fallback : Number(value))

export function parseConfig(raw: RawInputs): Config {
  if (!raw.projectId || !isNodeId(raw.projectId)) throw new Error('Missing or malformed project_id input.')
  const maxWrites = toNumber(raw.maxWrites, 50)
  if (!Number.isInteger(maxWrites) || maxWrites < 0) throw new Error(`Invalid max_writes input: "${raw.maxWrites}".`)
  const recentMinutes = toNumber(raw.recentMinutes, 10)
  if (!Number.isFinite(recentMinutes) || recentMinutes < 0) throw new Error(`Invalid recent_minutes input: "${raw.recentMinutes}".`)
  const pauseMs = toNumber(raw.pauseMs, 250)
  if (!Number.isFinite(pauseMs) || pauseMs < 0) throw new Error(`Invalid pause_ms input: "${raw.pauseMs}".`)
  const closePauseMs = toNumber(raw.closePauseMs ?? '', 4000)
  if (!Number.isFinite(closePauseMs) || closePauseMs < 0) throw new Error(`Invalid close_pause_ms input: "${raw.closePauseMs}".`)
  return {
    projectId: raw.projectId,
    // Safe by default: anything but an explicit "false" is a dry run.
    dryRun: raw.dryRun !== 'false',
    debug: raw.debug === 'true',
    maxWrites,
    recentMs: recentMinutes * 60 * 1000,
    pauseMs,
    closePauseMs
  }
}
