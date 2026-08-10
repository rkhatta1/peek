import { v } from 'convex/values'

import { query, type QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { requireActiveProjectForOwner, requireOwner } from './lib/domain'
import { projectValidator, providerValidator, rawStatusValidator, serviceValidator } from './lib/validators'

const HISTORY_LIMIT = 96

const snapshotValidator = v.object({
  _id: v.id('serviceMetricSnapshots'),
  _creationTime: v.number(),
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  serviceId: v.id('serviceConnections'),
  provider: providerValidator,
  capturedAt: v.number(),
  status: rawStatusValidator,
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

const summaryProviderValidator = v.object({
  connection: serviceValidator,
  latest: v.union(v.null(), snapshotValidator),
})

const serviceHistoryValidator = v.object({
  serviceId: v.id('serviceConnections'),
  history: v.array(snapshotValidator),
})

export const getSummary = query({
  args: { projectId: v.id('projects') },
  returns: v.object({
    project: projectValidator,
    providers: v.array(summaryProviderValidator),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const project = await requireActiveProjectForOwner(
      ctx,
      ownerId,
      args.projectId,
    )
    const services = await activeServices(ctx, project._id)
    const providers = await Promise.all(
      services.map(async (service) => {
        const latest = await ctx.db
          .query('serviceMetricSnapshots')
          .withIndex('by_service_and_capturedAt', (q) =>
            q.eq('serviceId', service._id),
          )
          .order('desc')
          .first()
        return {
          connection: publicService(service),
          latest: latest ? publicSnapshot(latest) : null,
        }
      }),
    )
    return { project: publicProject(project), providers }
  },
})

export const getHistory = query({
  args: { projectId: v.id('projects') },
  returns: v.array(serviceHistoryValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const project = await requireActiveProjectForOwner(
      ctx,
      ownerId,
      args.projectId,
    )
    const services = await activeServices(ctx, project._id)
    return await Promise.all(
      services.map(async (service) => {
        const snapshots = await ctx.db
          .query('serviceMetricSnapshots')
          .withIndex('by_service_and_capturedAt', (q) =>
            q.eq('serviceId', service._id),
          )
          .order('desc')
          .take(HISTORY_LIMIT)
        return {
          serviceId: service._id,
          history: snapshots.map(publicSnapshot).reverse(),
        }
      }),
    )
  },
})

async function activeServices(ctx: QueryCtx, projectId: Id<'projects'>) {
  return await ctx.db
    .query('serviceConnections')
    .withIndex('by_project_and_status', (q) =>
      q.eq('projectId', projectId).eq('status', 'active'),
    )
    .take(20)
}

function publicProject(project: Doc<'projects'>) {
  const {
    ownerId: _ownerId,
    normalizedName: _normalizedName,
    status: _status,
    collectionScheduleInitialized: _collectionScheduleInitialized,
    ...value
  } = project
  return {
    ...value,
    collectionIntervalMinutes: value.collectionIntervalMinutes ?? 15,
  }
}

function publicService(service: Doc<'serviceConnections'>) {
  const {
    ownerId: _ownerId,
    normalizedName: _normalizedName,
    status: _status,
    ...value
  } = service
  return value
}

function publicSnapshot(snapshot: Doc<'serviceMetricSnapshots'>) {
  const { ownerId: _ownerId, ...value } = snapshot
  return value
}
