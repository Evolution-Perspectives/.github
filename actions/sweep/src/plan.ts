// The three stages as pure planners over a snapshot, and the in-memory application of a write.
import type { Item, Plan, PlanContext, Snapshot, StagePlan, StageName, Write } from './model.ts'

// Status option names. IDs are always resolved live from the project, never stored.
export const STATUS = {
  done: '🏆 Done',
  canceled: '❌ Canceled',
  pendingRelease: '📤 Pending Release',
  inReview: '🧪 In Review'
} as const

const CLOSING_STATUSES: readonly (string | null)[] = [STATUS.done, STATUS.pendingRelease, STATUS.canceled]

const emptyPlan = (): Plan => ({ writes: [], skipped: [], mismatches: [] })

export function statusOptionId(snapshot: Snapshot, name: string): string {
  const id = snapshot.statusField.options[name]
  if (!id) throw new Error(`Status option "${name}" not found in project ${snapshot.projectId}.`)
  return id
}

function isRecent(item: Item, ctx: PlanContext): boolean {
  const latest = Math.max(Date.parse(item.updatedAt) || 0, Date.parse(item.issue.updatedAt) || 0)
  return ctx.now - latest < ctx.recentMs
}

/** Open issues with a closing Status are closed. Closed issues are never reopened. */
export function planClose(snapshot: Snapshot, ctx: PlanContext): Plan {
  const plan = emptyPlan()
  for (const item of snapshot.items) {
    const { issue } = item
    if (issue.state !== 'OPEN') continue
    let reason: 'COMPLETED' | 'NOT_PLANNED' | null = null
    if (item.status === STATUS.done || item.status === STATUS.pendingRelease) reason = 'COMPLETED'
    else if (item.status === STATUS.canceled) reason = 'NOT_PLANNED'
    if (!reason || !item.status) continue
    if (isRecent(item, ctx)) {
      plan.skipped.push({ ref: issue.ref, reason: 'recently edited' })
      continue
    }
    plan.writes.push({ type: 'close', issueId: issue.id, ref: issue.ref, reason, status: item.status })
  }
  return plan
}

/** Closed issues whose Status is empty or not a closing Status get the Status that matches the close reason. */
export function planStatus(snapshot: Snapshot, ctx: PlanContext): Plan {
  const plan = emptyPlan()
  for (const item of snapshot.items) {
    const { issue } = item
    if (issue.state !== 'CLOSED') continue
    const completed = issue.stateReason === 'COMPLETED'
    const notPlanned = issue.stateReason === 'NOT_PLANNED' || issue.stateReason === 'DUPLICATE'

    if (CLOSING_STATUSES.includes(item.status)) {
      // A closing Status that disagrees with the close reason was chosen by a human: report only.
      if (item.status && ((item.status === STATUS.done && notPlanned) || (item.status === STATUS.canceled && completed))) {
        plan.mismatches.push({ ref: issue.ref, status: item.status, reason: issue.stateReason })
      }
      continue
    }

    let target: string | null = null
    if (completed) target = item.status === STATUS.inReview ? STATUS.pendingRelease : STATUS.done
    else if (notPlanned) target = STATUS.canceled
    if (!target) {
      plan.skipped.push({ ref: issue.ref, reason: `unknown close reason (${issue.stateReason ?? 'none'})` })
      continue
    }
    if (isRecent(item, ctx)) {
      plan.skipped.push({ ref: issue.ref, reason: 'recently edited' })
      continue
    }
    plan.writes.push({
      type: 'status',
      itemId: item.id,
      ref: issue.ref,
      from: item.status,
      optionName: target,
      optionId: statusOptionId(snapshot, target)
    })
  }
  return plan
}

/**
 * "Blocked by" links whose blocker is closed are removed, for open and closed blocked issues alike.
 * The blocker state comes from the snapshot when the blocker is in the project, so a blocker closed
 * by the close stage of the same run counts as closed.
 */
export function planBlocking(snapshot: Snapshot, ctx: PlanContext): Plan {
  const plan = emptyPlan()
  const inProject = new Map(snapshot.items.map((item) => [item.issue.id, item.issue] as const))
  for (const item of snapshot.items) {
    const { issue } = item
    for (const blocker of issue.blockedBy) {
      const state = inProject.get(blocker.id)?.state ?? blocker.state
      if (state !== 'CLOSED') continue
      if (isRecent(item, ctx)) {
        plan.skipped.push({ ref: issue.ref, reason: `recently edited (blocked by ${blocker.ref})` })
        continue
      }
      plan.writes.push({ type: 'unblock', issueId: issue.id, blockingIssueId: blocker.id, ref: issue.ref, blockerRef: blocker.ref })
    }
  }
  return plan
}

/** Applies a write that succeeded to the in-memory snapshot. */
export function applyWrite(snapshot: Snapshot, write: Write): void {
  switch (write.type) {
    case 'close':
      for (const item of snapshot.items) {
        if (item.issue.id === write.issueId) {
          item.issue.state = 'CLOSED'
          item.issue.stateReason = write.reason
        }
      }
      return
    case 'status':
      for (const item of snapshot.items) if (item.id === write.itemId) item.status = write.optionName
      return
    case 'unblock':
      for (const item of snapshot.items) {
        if (item.issue.id === write.issueId) item.issue.blockedBy = item.issue.blockedBy.filter((b) => b.id !== write.blockingIssueId)
      }
      return
    default: {
      const unreachable: never = write
      throw new Error(`Unknown write ${JSON.stringify(unreachable)}`)
    }
  }
}

export const STAGES: readonly { name: StageName; plan: (snapshot: Snapshot, ctx: PlanContext) => Plan }[] = [
  { name: 'close', plan: planClose },
  { name: 'status', plan: planStatus },
  { name: 'blocking', plan: planBlocking }
]

/** Plans every stage against a copy, assuming each write succeeds. */
export function planAll(snapshot: Snapshot, ctx: PlanContext): StagePlan[] {
  const simulated = structuredClone(snapshot)
  return STAGES.map(({ name, plan }) => {
    const result = plan(simulated, ctx)
    for (const write of result.writes) applyWrite(simulated, write)
    return { name, ...result }
  })
}

export function describeWrite(write: Write): string {
  switch (write.type) {
    case 'close':
      return `close ${write.ref} as ${write.reason.toLowerCase()} (Status ${write.status})`
    case 'status':
      return `${write.ref}: Status ${write.from ?? '(empty)'} -> ${write.optionName}`
    case 'unblock':
      return `${write.ref}: remove "blocked by" ${write.blockerRef}`
    default: {
      const unreachable: never = write
      throw new Error(`Unknown write ${JSON.stringify(unreachable)}`)
    }
  }
}
