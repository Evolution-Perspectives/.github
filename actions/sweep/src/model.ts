// Types of the sweep: the in-memory snapshot of the project, the writes and the plans.

export interface BlockerRef {
  id: string
  ref: string
  state: string
}

export interface Issue {
  id: string
  number: number
  ref: string
  state: string // OPEN | CLOSED
  stateReason: string | null // COMPLETED | NOT_PLANNED | DUPLICATE | REOPENED | null
  updatedAt: string
  blockedBy: BlockerRef[]
  issueType?: string | null // issue type name, null or absent when the issue has none
  subIssueIds?: string[] // ids of the direct sub-issues (any repository)
}

/** Sprint value of an item: the iteration it sits in. */
export interface SprintValue {
  startDate: string // YYYY-MM-DD
  duration: number // days
}

export interface Item {
  id: string
  updatedAt: string
  status: string | null // Status option name, null when empty
  sprint?: SprintValue | null
  endDate?: string | null // End date field value, YYYY-MM-DD
  issue: Issue
}

export interface StatusField {
  id: string
  options: Record<string, string> // option name -> option id, resolved live
}

export interface Snapshot {
  projectId: string
  statusField: StatusField
  endDateField: { id: string }
  items: Item[]
  truncated: string[] // issues with more than 50 blockers (only the first 50 were read)
  truncatedSubIssues?: string[] // issues with more than 100 sub-issues (only the first 100 were read)
}

export type Write =
  | { type: 'close'; issueId: string; ref: string; reason: 'COMPLETED' | 'NOT_PLANNED'; status: string }
  | { type: 'status'; itemId: string; ref: string; from: string | null; optionName: string; optionId: string }
  | { type: 'unblock'; issueId: string; blockingIssueId: string; ref: string; blockerRef: string }
  | { type: 'endDate'; itemId: string; ref: string; from: string | null; to: string }

export interface Skipped {
  ref: string
  reason: string
}

export interface Mismatch {
  ref: string
  status: string
  reason: string | null
}

export interface Plan {
  writes: Write[]
  skipped: Skipped[]
  mismatches: Mismatch[]
}

export type StageName = 'close' | 'status' | 'blocking' | 'endDate'

export interface StagePlan extends Plan {
  name: StageName
}

export interface PlanContext {
  now: number // epoch ms
  recentMs: number // items touched more recently than this are skipped
}

export interface Config {
  projectId: string
  dryRun: boolean
  debug: boolean
  maxWrites: number
  recentMs: number
  pauseMs: number
  /** Pause after each issue close: a close fires `issues: closed` workflows in the issue's repository. */
  closePauseMs: number
}
