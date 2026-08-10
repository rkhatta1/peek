import { v } from 'convex/values'

import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { requireActiveProjectForOwner } from './domain'
import { incrementLedgerTotals } from './ledgerTotals'

export type CheckTriggerSource = 'connection' | 'manual' | 'scheduled'

export type ScheduledCheckAggregate<ProjectId = Id<'projects'>> = {
  projectId: ProjectId
  ownerId: string
  triggeredAt: number
  completedAt: number
  serviceCount: number
  operationalCount: number
  attentionCount: number
  unavailableCount: number
}

export const scheduledCheckAggregateValidator = v.object({
  projectId: v.id('projects'),
  ownerId: v.string(),
  triggeredAt: v.number(),
  completedAt: v.number(),
  serviceCount: v.number(),
  operationalCount: v.number(),
  attentionCount: v.number(),
  unavailableCount: v.number(),
})

export function foldScheduledPage<ProjectId>(
  pending: ScheduledCheckAggregate<ProjectId> | null,
  page: ScheduledCheckAggregate<ProjectId>[],
  isDone: boolean,
) {
  const completed: ScheduledCheckAggregate<ProjectId>[] = []
  let current = pending
  for (const aggregate of page) {
    if (current && current.projectId === aggregate.projectId) {
      if (current.ownerId !== aggregate.ownerId) {
        throw new Error('Scheduled Check owner changed')
      }
      current = {
        ...current,
        triggeredAt: Math.min(current.triggeredAt, aggregate.triggeredAt),
        completedAt: Math.max(current.completedAt, aggregate.completedAt),
        serviceCount: current.serviceCount + aggregate.serviceCount,
        operationalCount:
          current.operationalCount + aggregate.operationalCount,
        attentionCount: current.attentionCount + aggregate.attentionCount,
        unavailableCount: current.unavailableCount + aggregate.unavailableCount,
      }
    } else {
      if (current) completed.push(current)
      current = aggregate
    }
  }
  if (isDone && current) {
    completed.push(current)
    current = null
  }
  return { completed, pending: current }
}

export async function insertCheckTrigger(
  ctx: MutationCtx,
  args: {
    ownerId: string
    projectId: Id<'projects'>
    source: CheckTriggerSource
    triggeredAt: number
    completedAt: number
    serviceCount: number
    operationalCount: number
    attentionCount: number
    unavailableCount: number
  },
) {
  const project = await requireActiveProjectForOwner(
    ctx,
    args.ownerId,
    args.projectId,
  )
  const counts = [
    args.serviceCount,
    args.operationalCount,
    args.attentionCount,
    args.unavailableCount,
  ]
  if (
    counts.some((count) => !Number.isSafeInteger(count) || count < 0) ||
    args.operationalCount + args.attentionCount + args.unavailableCount !==
      args.serviceCount ||
    args.completedAt < args.triggeredAt
  ) {
    throw new Error('Invalid check trigger')
  }
  const status =
    args.attentionCount > 0 || args.unavailableCount > 0
      ? ('attention' as const)
      : ('operational' as const)
  const triggerId = await ctx.db.insert('checkTriggers', {
    clientId: project.clientId,
    projectId: project._id,
    ownerId: args.ownerId,
    source: args.source,
    status,
    triggeredAt: args.triggeredAt,
    completedAt: args.completedAt,
    serviceCount: args.serviceCount,
    operationalCount: args.operationalCount,
    attentionCount: args.attentionCount,
    unavailableCount: args.unavailableCount,
  })
  await incrementLedgerTotals(
    ctx,
    { clientId: project.clientId, projectId: project._id, ownerId: args.ownerId },
    {
      checkTriggers: 1,
      checkAttentionTriggers: status === 'attention' ? 1 : 0,
    },
  )
  return triggerId
}
