import { v } from 'convex/values'

export const providerValidator = v.union(v.literal('neon'), v.literal('upstash'))
export const codeProviderValidator = v.union(
  v.literal('github'),
  v.literal('vercel'),
)
export const lifecycleStatusValidator = v.union(v.literal('active'), v.literal('deleted'))
export const credentialStateValidator = v.union(v.literal('valid'), v.literal('error'))
export const rawStatusValidator = v.union(
  v.literal('operational'),
  v.literal('degraded'),
  v.literal('unavailable'),
)

export const encryptedCredentialsValidator = v.object({
  algorithm: v.literal('AES-GCM'),
  binding: v.string(),
  ciphertext: v.string(),
  iv: v.string(),
  keyId: v.string(),
})

export const providerCredentialsValidator = v.union(
  v.object({
    provider: v.literal('neon'),
    databaseUrl: v.string(),
  }),
  v.object({
    provider: v.literal('upstash'),
    email: v.string(),
    apiKey: v.string(),
    databaseId: v.string(),
  }),
)

export const codeConnectionCredentialsValidator = v.union(
  v.object({
    provider: v.literal('github'),
    token: v.string(),
  }),
  v.object({
    provider: v.literal('vercel'),
    token: v.string(),
  }),
)

const sharedSnapshotFields = {
  capturedAt: v.number(),
  status: rawStatusValidator,
  connections: v.number(),
  cacheHitRatio: v.number(),
}

export const providerSnapshotValidator = v.union(
  v.object({
    ...sharedSnapshotFields,
    provider: v.literal('neon'),
    deadlocks: v.number(),
    logicalSizeBytes: v.number(),
    queryInsightsEnabled: v.boolean(),
  }),
  v.object({
    ...sharedSnapshotFields,
    provider: v.literal('upstash'),
    requestCount: v.number(),
    storageBytes: v.number(),
    p99LatencyMs: v.number(),
  }),
)

export const clientValidator = v.object({
  _id: v.id('clients'),
  _creationTime: v.number(),
  name: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const projectValidator = v.object({
  _id: v.id('projects'),
  _creationTime: v.number(),
  clientId: v.id('clients'),
  name: v.string(),
  collectionIntervalMinutes: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const serviceValidator = v.object({
  _id: v.id('serviceConnections'),
  _creationTime: v.number(),
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  provider: providerValidator,
  name: v.string(),
  environment: v.string(),
  active: v.boolean(),
  credentialState: credentialStateValidator,
  lastValidatedAt: v.number(),
  lastCollectedAt: v.optional(v.number()),
  lastErrorCode: v.optional(v.string()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const codeConnectionValidator = v.object({
  _id: v.id('codeConnections'),
  _creationTime: v.number(),
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  provider: codeProviderValidator,
  externalId: v.string(),
  externalSlug: v.string(),
  name: v.string(),
  branch: v.literal('main'),
  environment: v.literal('production'),
  lastValidatedAt: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

export const agentEventValidator = v.object({
  _id: v.id('agentEvents'),
  _creationTime: v.number(),
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  eventId: v.string(),
  runId: v.optional(v.string()),
  type: v.string(),
  summary: v.string(),
  occurredAt: v.number(),
  receivedAt: v.number(),
})
