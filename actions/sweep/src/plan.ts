// The four stages as pure planners over a snapshot, and the in-memory application of a write.
import type { Item, Plan, PlanContext, Snapshot, StagePlan, StageName, Write } from './model.ts'

// Status option names. IDs are always resolved live from the project, never stored.
export const STATUS = {
  done: '🏆 Done',
  canceled: '❌ Canceled',
  pendingRelease: '📤 Pending Release',
  inReview: '🧪 In Review'
} as const

// Issue type of the issues whose End date the sweep derives. Resolved by name, like Status options.
export const PROJECT_TYPE = 'Projet'

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

/** Last day of a sprint: its start date plus its duration minus one day (UTC, YYYY-MM-DD). */
export function sprintEnd(startDate: string, duration: number): string {
  const date = new Date(`${startDate}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + duration - 1)
  return date.toISOString().slice(0, 10)
}

/**
 * End of the latest Sprint among the leaves under a project, or null when no leaf has a Sprint.
 * Sub-issues are walked at any depth; a leaf is an issue with no sub-issues (the project itself never
 * is one), parents are ignored even if they carry a Sprint, and a sub-issue outside the project has
 * no Sprint. A visited set stops a cycle.
 */
function latestLeafSprintEnd(root: Item, byIssue: Map<string, Item>): string | null {
  const seen = new Set([root.issue.id])
  const stack = [...(root.issue.subIssueIds ?? [])]
  let latest: string | null = null
  while (stack.length > 0) {
    const id = stack.pop()!
    if (seen.has(id)) continue
    seen.add(id)
    const child = byIssue.get(id)
    if (!child) continue
    const kids = child.issue.subIssueIds ?? []
    if (kids.length > 0) {
      stack.push(...kids)
      continue
    }
    if (!child.sprint) continue
    const end = sprintEnd(child.sprint.startDate, child.sprint.duration)
    if (!latest || end > latest) latest = end
  }
  return latest
}

/**
 * The End date of an open Projet is the end of the latest Sprint among its leaf descendants. It
 * overwrites the stored date. Closed projects, other types and projects without a planned leaf are
 * left alone; a date is never cleared.
 */
export function planEndDate(snapshot: Snapshot, ctx: PlanContext): Plan {
  const plan = emptyPlan()
  const byIssue = new Map(snapshot.items.map((item) => [item.issue.id, item] as const))
  for (const item of snapshot.items) {
    const { issue } = item
    if (issue.state !== 'OPEN' || issue.issueType !== PROJECT_TYPE) continue
    const to = latestLeafSprintEnd(item, byIssue)
    if (!to) {
      plan.skipped.push({ ref: issue.ref, reason: 'no planned leaf' })
      continue
    }
    if ((item.endDate ?? null) === to) continue
    if (isRecent(item, ctx)) {
      plan.skipped.push({ ref: issue.ref, reason: 'recently edited' })
      continue
    }
    plan.writes.push({ type: 'endDate', itemId: item.id, ref: issue.ref, from: item.endDate ?? null, to })
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
    case 'endDate':
      for (const item of snapshot.items) if (item.id === write.itemId) item.endDate = write.to
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
  { name: 'blocking', plan: planBlocking },
  { name: 'endDate', plan: planEndDate }
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
    case 'endDate':
      return `set End date of ${write.ref} from ${write.from ?? '(empty)'} to ${write.to}`
    default: {
      const unreachable: never = write
      throw new Error(`Unknown write ${JSON.stringify(unreachable)}`)
    }
  }
}
