import { v } from 'convex/values'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'
import {
  activeProjectForOwner,
  requireActiveProjectForOwner,
} from './lib/domain'

export const rotateToken = internalMutation({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    tokenId: v.string(),
    tokenHash: v.string(),
    hint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await requireActiveProjectForOwner(
      ctx,
      args.ownerId,
      args.projectId,
    )
    const now = Date.now()
    let endpoint = await ctx.db
      .query('agentEndpoints')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (!endpoint) {
      const endpointId = await ctx.db.insert('agentEndpoints', {
        clientId: project.clientId,
        projectId: project._id,
        ownerId: args.ownerId,
        comment: '',
        createdAt: now,
        updatedAt: now,
      })
      endpoint = await ctx.db.get(endpointId)
    }
    if (!endpoint || endpoint.ownerId !== args.ownerId) {
      throw new Error('Agent endpoint not found')
    }

    const currentToken = await ctx.db
      .query('agentApiTokens')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    if (currentToken) await ctx.db.delete(currentToken._id)
    await ctx.db.insert('agentApiTokens', {
      endpointId: endpoint._id,
      clientId: project.clientId,
      projectId: project._id,
      ownerId: args.ownerId,
      tokenId: args.tokenId,
      tokenHash: args.tokenHash,
      hint: args.hint,
      createdAt: now,
    })
    return null
  },
})

export const statusForToken = internalQuery({
  args: { tokenId: v.string(), tokenHash: v.string() },
  returns: v.union(v.null(), v.object({ comment: v.string() })),
  handler: async (ctx, args) => {
    const authenticated = await authenticatedEndpoint(ctx, args)
    return authenticated ? { comment: authenticated.endpoint.comment } : null
  },
})

const recordedEventValidator = v.object({
  accepted: v.literal(true),
  comment: v.string(),
  duplicate: v.boolean(),
  eventId: v.string(),
})

export const recordEventForToken = internalMutation({
  args: {
    tokenId: v.string(),
    tokenHash: v.string(),
    eventId: v.string(),
    runId: v.optional(v.string()),
    type: v.string(),
    summary: v.string(),
    occurredAt: v.number(),
  },
  returns: v.union(v.null(), recordedEventValidator),
  handler: async (ctx, args) => {
    const authenticated = await authenticatedEndpoint(ctx, args)
    if (!authenticated) return null
    const { endpoint, project, token } = authenticated
    const duplicate = await ctx.db
      .query('agentEvents')
      .withIndex('by_project_and_eventId', (q) =>
        q.eq('projectId', project._id).eq('eventId', args.eventId),
      )
      .unique()
    if (!duplicate) {
      await ctx.db.insert('agentEvents', {
        clientId: project.clientId,
        projectId: project._id,
        ownerId: token.ownerId,
        eventId: args.eventId,
        runId: args.runId,
        type: args.type,
        summary: args.summary,
        occurredAt: args.occurredAt,
        receivedAt: Date.now(),
      })
    }
    return {
      accepted: true as const,
      comment: endpoint.comment,
      duplicate: Boolean(duplicate),
      eventId: args.eventId,
    }
  },
})

async function authenticatedEndpoint(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  args: { tokenId: string; tokenHash: string },
) {
  const token = await ctx.db
    .query('agentApiTokens')
    .withIndex('by_tokenId', (q) => q.eq('tokenId', args.tokenId))
    .unique()
  if (!token || token.tokenHash !== args.tokenHash) return null
  const [endpoint, project] = await Promise.all([
    ctx.db.get(token.endpointId),
    activeProjectForOwner(ctx, token.ownerId, token.projectId),
  ])
  if (!endpoint || !project || endpoint.ownerId !== token.ownerId) return null
  return { endpoint, project, token }
}
