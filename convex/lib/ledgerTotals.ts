import type { Id } from '../_generated/dataModel'
import type { MutationCtx } from '../_generated/server'

type LedgerDelta = Partial<{
  agentCommits: number
  checkAttentionTriggers: number
  checkTriggers: number
}>

export async function incrementLedgerTotals(
  ctx: MutationCtx,
  scope: {
    clientId: Id<'clients'>
    projectId: Id<'projects'>
    ownerId: string
  },
  delta: LedgerDelta,
) {
  const current = await ctx.db
    .query('ledgerTotals')
    .withIndex('by_project', (q) => q.eq('projectId', scope.projectId))
    .unique()
  const next = {
    agentCommits: Math.max(0, (current?.agentCommits ?? 0) + (delta.agentCommits ?? 0)),
    checkAttentionTriggers: Math.max(
      0,
      (current?.checkAttentionTriggers ?? 0) +
        (delta.checkAttentionTriggers ?? 0),
    ),
    checkTriggers: Math.max(
      0,
      (current?.checkTriggers ?? 0) + (delta.checkTriggers ?? 0),
    ),
  }
  if (current) {
    await ctx.db.patch(current._id, {
      ...next,
      updatedAt: nextRevision(current.updatedAt),
    })
    return
  }
  await ctx.db.insert('ledgerTotals', {
    ...scope,
    ...next,
    updatedAt: Date.now(),
  })
}

export async function touchLedgerTotals(
  ctx: MutationCtx,
  scope: {
    clientId: Id<'clients'>
    projectId: Id<'projects'>
    ownerId: string
  },
) {
  const current = await ctx.db
    .query('ledgerTotals')
    .withIndex('by_project', (q) => q.eq('projectId', scope.projectId))
    .unique()
  if (current) {
    await ctx.db.patch(current._id, {
      updatedAt: nextRevision(current.updatedAt),
    })
    return
  }
  await ctx.db.insert('ledgerTotals', {
    ...scope,
    agentCommits: 0,
    checkAttentionTriggers: 0,
    checkTriggers: 0,
    updatedAt: Date.now(),
  })
}

function nextRevision(current: number) {
  return Math.max(Date.now(), current + 1)
}
