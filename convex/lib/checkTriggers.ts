import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'
import { requireActiveProjectForOwner } from './domain'
import { incrementLedgerTotals } from './ledgerTotals'

export type CheckTriggerSource = 'connection' | 'manual' | 'scheduled'

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
