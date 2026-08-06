import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

const provider = v.union(v.literal('neon'), v.literal('upstash'))
const rawStatus = v.union(
  v.literal('operational'),
  v.literal('degraded'),
  v.literal('unavailable'),
)

export default defineSchema({
  workspaces: defineTable({
    ownerId: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }).index('by_owner', ['ownerId']),

  connections: defineTable({
    workspaceId: v.id('workspaces'),
    ownerId: v.string(),
    provider,
    name: v.string(),
    environment: v.string(),
    mode: v.union(v.literal('demo'), v.literal('live')),
    active: v.boolean(),
    createdAt: v.number(),
  })
    .index('by_owner', ['ownerId'])
    .index('by_active', ['active'])
    .index('by_owner_active', ['ownerId', 'active'])
    .index('by_workspace_provider', ['workspaceId', 'provider']),

  metricSnapshots: defineTable({
    workspaceId: v.id('workspaces'),
    connectionId: v.id('connections'),
    ownerId: v.string(),
    provider,
    capturedAt: v.number(),
    status: rawStatus,
    connections: v.number(),
    cacheHitRatio: v.number(),
    requestCount: v.optional(v.number()),
    storageBytes: v.optional(v.number()),
    p99LatencyMs: v.optional(v.number()),
    deadlocks: v.optional(v.number()),
    logicalSizeBytes: v.optional(v.number()),
    queryInsightsEnabled: v.optional(v.boolean()),
    errorCode: v.optional(v.string()),
  })
    .index('by_connection_captured', ['connectionId', 'capturedAt'])
    .index('by_owner_provider_captured', [
      'ownerId',
      'provider',
      'capturedAt',
    ]),
})
