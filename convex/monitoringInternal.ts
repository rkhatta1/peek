import { v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'

export const listActiveConnections = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query('connections')
      .withIndex('by_active', (q) => q.eq('active', true))
      .take(100)
  },
})

export const listActiveConnectionsForOwner = internalQuery({
  args: { ownerId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('connections')
      .withIndex('by_owner_active', (q) =>
        q.eq('ownerId', args.ownerId).eq('active', true),
      )
      .take(8)
  },
})

export const recordSnapshot = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    connectionId: v.id('connections'),
    ownerId: v.string(),
    provider: v.union(v.literal('neon'), v.literal('upstash')),
    capturedAt: v.number(),
    status: v.union(
      v.literal('operational'),
      v.literal('degraded'),
      v.literal('unavailable'),
    ),
    connections: v.number(),
    cacheHitRatio: v.number(),
    requestCount: v.optional(v.number()),
    storageBytes: v.optional(v.number()),
    p99LatencyMs: v.optional(v.number()),
    deadlocks: v.optional(v.number()),
    logicalSizeBytes: v.optional(v.number()),
    queryInsightsEnabled: v.optional(v.boolean()),
    errorCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert('metricSnapshots', args)
  },
})
