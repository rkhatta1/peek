import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'

import {
  codeProviderValidator,
  credentialStateValidator,
  encryptedCredentialsValidator,
  lifecycleStatusValidator,
  providerValidator,
} from './lib/validators'

const provider = v.union(v.literal('neon'), v.literal('upstash'))
const rawStatus = v.union(
  v.literal('operational'),
  v.literal('degraded'),
  v.literal('unavailable'),
)

export default defineSchema({
  clients: defineTable({
    ownerId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    status: lifecycleStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_owner_and_status', ['ownerId', 'status'])
    .index('by_owner_and_normalizedName_and_status', [
      'ownerId',
      'normalizedName',
      'status',
    ]),

  projects: defineTable({
    clientId: v.id('clients'),
    ownerId: v.string(),
    name: v.string(),
    normalizedName: v.string(),
    status: lifecycleStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_client_and_status', ['clientId', 'status'])
    .index('by_client_and_normalizedName_and_status', [
      'clientId',
      'normalizedName',
      'status',
    ]),

  serviceConnections: defineTable({
    clientId: v.id('clients'),
    projectId: v.id('projects'),
    ownerId: v.string(),
    provider: providerValidator,
    name: v.string(),
    normalizedName: v.string(),
    environment: v.string(),
    active: v.boolean(),
    status: lifecycleStatusValidator,
    credentialState: credentialStateValidator,
    lastValidatedAt: v.number(),
    lastCollectedAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_and_status', ['projectId', 'status'])
    .index('by_client_and_status', ['clientId', 'status'])
    .index('by_active_and_status', ['active', 'status'])
    .index('by_project_and_provider_and_normalizedName_and_status', [
      'projectId',
      'provider',
      'normalizedName',
      'status',
    ]),

  serviceCredentials: defineTable({
    serviceId: v.id('serviceConnections'),
    ownerId: v.string(),
    ...encryptedCredentialsValidator.fields,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_service', ['serviceId']),

  serviceMetricSnapshots: defineTable({
    clientId: v.id('clients'),
    projectId: v.id('projects'),
    serviceId: v.id('serviceConnections'),
    ownerId: v.string(),
    provider: providerValidator,
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
    .index('by_service_and_capturedAt', ['serviceId', 'capturedAt'])
    .index('by_client', ['clientId'])
    .index('by_project', ['projectId']),

  codeConnections: defineTable({
    clientId: v.id('clients'),
    projectId: v.id('projects'),
    ownerId: v.string(),
    provider: codeProviderValidator,
    externalId: v.string(),
    externalSlug: v.string(),
    name: v.string(),
    branch: v.literal('main'),
    environment: v.literal('production'),
    status: lifecycleStatusValidator,
    lastValidatedAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_project_and_status', ['projectId', 'status'])
    .index('by_client_and_status', ['clientId', 'status'])
    .index('by_project_and_provider_and_status', [
      'projectId',
      'provider',
      'status',
    ]),

  codeConnectionCredentials: defineTable({
    connectionId: v.id('codeConnections'),
    ownerId: v.string(),
    ...encryptedCredentialsValidator.fields,
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index('by_connection', ['connectionId']),

  // Legacy demo-only tables retained during the non-destructive domain migration.
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
