import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, query } from './_generated/server'
import { requireActiveProjectForOwner, requireOwner } from './lib/domain'
import { insertCheckTrigger } from './lib/checkTriggers'

const sourceValidator = v.union(
  v.literal('connection'),
  v.literal('manual'),
  v.literal('scheduled'),
)
const statusValidator = v.union(
  v.literal('operational'),
  v.literal('attention'),
)
const checkTriggerValidator = v.object({
  _id: v.id('checkTriggers'),
  _creationTime: v.number(),
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  source: sourceValidator,
  status: statusValidator,
  triggeredAt: v.number(),
  completedAt: v.number(),
  serviceCount: v.number(),
  operationalCount: v.number(),
  attentionCount: v.number(),
  unavailableCount: v.number(),
})

export const list = query({
  args: {
    projectId: v.id('projects'),
    attentionOnly: v.boolean(),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(checkTriggerValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const result = args.attentionOnly
      ? await ctx.db
          .query('checkTriggers')
          .withIndex('by_project_and_status_and_triggeredAt', (q) =>
            q.eq('projectId', args.projectId).eq('status', 'attention'),
          )
          .order('desc')
          .paginate(args.paginationOpts)
      : await ctx.db
          .query('checkTriggers')
          .withIndex('by_project_and_triggeredAt', (q) =>
            q.eq('projectId', args.projectId),
          )
          .order('desc')
          .paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map(({ ownerId: _ownerId, ...trigger }) => trigger),
    }
  },
})

export const record = internalMutation({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    source: sourceValidator,
    triggeredAt: v.number(),
    completedAt: v.number(),
    serviceCount: v.number(),
    operationalCount: v.number(),
    attentionCount: v.number(),
    unavailableCount: v.number(),
  },
  returns: v.id('checkTriggers'),
  handler: async (ctx, args) => await insertCheckTrigger(ctx, args),
})
