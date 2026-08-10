import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import { internalMutation, internalQuery } from './_generated/server'
import {
  activeProjectForOwner,
  requireActiveProjectForOwner,
} from './lib/domain'
import { touchLedgerTotals } from './lib/ledgerTotals'

const eventStatsValidator = v.object({
  status: v.union(v.literal('operational'), v.literal('attention')),
  triggeredAt: v.number(),
  completedAt: v.number(),
  services: v.number(),
  operational: v.number(),
  attention: v.number(),
  unavailable: v.number(),
})

const statusPayloadValidator = v.object({
  comment: v.string(),
  commitHash: v.union(v.null(), v.string()),
  commitTitle: v.union(v.null(), v.string()),
  eventStats: v.union(v.null(), eventStatsValidator),
})

const EVENT_WINDOW_MS = 60_000
const EVENT_WINDOW_LIMIT = 60

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
  returns: v.union(v.null(), statusPayloadValidator),
  handler: async (ctx, args) => {
    const authenticated = await authenticatedEndpoint(ctx, args)
    return authenticated
      ? await statusPayload(ctx, authenticated.endpoint, authenticated.project._id)
      : null
  },
})

export const authenticateToken = internalQuery({
  args: { tokenId: v.string(), tokenHash: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => Boolean(await authenticatedEndpoint(ctx, args)),
})

const recordedEventValidator = v.object({
  accepted: v.literal(true),
  duplicate: v.boolean(),
  eventId: v.string(),
  ...statusPayloadValidator.fields,
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
  returns: v.union(
    v.null(),
    v.object({ rateLimited: v.literal(true) }),
    recordedEventValidator,
  ),
  handler: async (ctx, args) => {
    const authenticated = await authenticatedEndpoint(ctx, args)
    if (!authenticated) return null
    const { endpoint, project, token } = authenticated
    const now = Date.now()
    const inCurrentWindow =
      token.eventWindowStartedAt !== undefined &&
      now - token.eventWindowStartedAt < EVENT_WINDOW_MS
    if (inCurrentWindow && (token.eventWindowCount ?? 0) >= EVENT_WINDOW_LIMIT) {
      return { rateLimited: true as const }
    }
    await ctx.db.patch(token._id, {
      eventWindowStartedAt: inCurrentWindow ? token.eventWindowStartedAt : now,
      eventWindowCount: inCurrentWindow ? (token.eventWindowCount ?? 0) + 1 : 1,
    })
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
        receivedAt: now,
      })
      await touchLedgerTotals(ctx, {
        clientId: project.clientId,
        projectId: project._id,
        ownerId: token.ownerId,
      })
    }
    return {
      accepted: true as const,
      duplicate: Boolean(duplicate),
      eventId: args.eventId,
      ...(await statusPayload(ctx, endpoint, project._id)),
    }
  },
})

async function statusPayload(
  ctx: Pick<QueryCtx | MutationCtx, 'db'>,
  endpoint: {
    ownerId: string
    comment: string
    activeCommitId?: Id<'agentCommits'>
  },
  projectId: Id<'projects'>,
) {
  if (!endpoint.activeCommitId) return emptyStatus(endpoint.comment)
  const commit = await ctx.db.get(endpoint.activeCommitId)
  const connection = await ctx.db
    .query('codeConnections')
    .withIndex('by_project_and_provider_and_status', (q) =>
      q
        .eq('projectId', projectId)
        .eq('provider', 'github')
        .eq('status', 'active'),
    )
    .unique()
  if (
    !commit ||
    !connection ||
    connection._id !== commit.connectionId ||
    connection.ownerId !== endpoint.ownerId ||
    commit.ownerId !== endpoint.ownerId ||
    commit.projectId !== projectId ||
    !commit.comment
  ) {
    return emptyStatus()
  }
  const trigger = await ctx.db
    .query('checkTriggers')
    .withIndex('by_project_and_triggeredAt', (q) =>
      q.eq('projectId', projectId).gte('triggeredAt', commit.committedAt),
    )
    .order('asc')
    .first()
  return {
    comment: commit.comment,
    commitHash: commit.sha,
    commitTitle: commit.title,
    eventStats: trigger
      ? {
          status: trigger.status,
          triggeredAt: trigger.triggeredAt,
          completedAt: trigger.completedAt,
          services: trigger.serviceCount,
          operational: trigger.operationalCount,
          attention: trigger.attentionCount,
          unavailable: trigger.unavailableCount,
        }
      : null,
  }
}

function emptyStatus(comment = '') {
  return {
    comment,
    commitHash: null,
    commitTitle: null,
    eventStats: null,
  }
}

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
