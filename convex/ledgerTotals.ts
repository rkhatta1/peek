import { v } from 'convex/values'

import { query } from './_generated/server'
import { requireActiveProjectForOwner, requireOwner } from './lib/domain'

export const get = query({
  args: { projectId: v.id('projects') },
  returns: v.object({
    agentCommits: v.number(),
    checkAttentionTriggers: v.number(),
    checkTriggers: v.number(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const totals = await ctx.db
      .query('ledgerTotals')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    return {
      agentCommits: totals?.agentCommits ?? 0,
      checkAttentionTriggers: totals?.checkAttentionTriggers ?? 0,
      checkTriggers: totals?.checkTriggers ?? 0,
      updatedAt: totals?.updatedAt ?? 0,
    }
  },
})
