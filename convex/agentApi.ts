import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireActiveProjectForOwner, requireOwner } from './lib/domain'
import { agentEventValidator } from './lib/validators'

const settingsValidator = v.object({
  comment: v.string(),
  token: v.union(
    v.null(),
    v.object({ createdAt: v.number(), hint: v.string() }),
  ),
})

export const getSettings = query({
  args: { projectId: v.id('projects') },
  returns: settingsValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const [endpoint, token] = await Promise.all([
      ctx.db
        .query('agentEndpoints')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .unique(),
      ctx.db
        .query('agentApiTokens')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .unique(),
    ])
    return {
      comment: endpoint?.comment ?? '',
      token: token ? { createdAt: token.createdAt, hint: token.hint } : null,
    }
  },
})

export const updateComment = mutation({
  args: { projectId: v.id('projects'), comment: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const project = await requireActiveProjectForOwner(
      ctx,
      ownerId,
      args.projectId,
    )
    const comment = args.comment.trim()
    if (comment.length > 2_000) throw new Error('Comment is too long')
    const endpoint = await ctx.db
      .query('agentEndpoints')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    const now = Date.now()
    if (endpoint) {
      if (endpoint.ownerId !== ownerId) throw new Error('Agent endpoint not found')
      await ctx.db.patch(endpoint._id, { comment, updatedAt: now })
    } else {
      await ctx.db.insert('agentEndpoints', {
        clientId: project.clientId,
        projectId: project._id,
        ownerId,
        comment,
        createdAt: now,
        updatedAt: now,
      })
    }
    return null
  },
})

export const revokeToken = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const token = await ctx.db
      .query('agentApiTokens')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (token) {
      if (token.ownerId !== ownerId) throw new Error('Agent token not found')
      await ctx.db.delete(token._id)
    }
    return null
  },
})

export const listRecentEvents = query({
  args: { projectId: v.id('projects') },
  returns: v.array(agentEventValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const events = await ctx.db
      .query('agentEvents')
      .withIndex('by_project_and_receivedAt', (q) =>
        q.eq('projectId', args.projectId),
      )
      .order('desc')
      .take(50)
    return events.map(({ ownerId: _ownerId, ...event }) => event)
  },
})
