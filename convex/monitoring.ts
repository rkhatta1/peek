import { v } from 'convex/values'

import { query } from './_generated/server'
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

export const getOverview = query({
  args: { projectId: v.id('projects') },
  returns: v.object({
    project: projectValidator,
    providers: v.array(
      v.object({
        connection: serviceValidator,
        latest: v.union(v.null(), snapshotValidator),
        history: v.array(snapshotValidator),
      }),
    ),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const project = await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const services = await ctx.db
      .query('serviceConnections')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', project._id).eq('status', 'active'),
      )
      .take(20)
    const providers = await Promise.all(
      services.map(async ({ ownerId: _ownerId, normalizedName: _normalizedName, status: _status, ...connection }) => {
        const snapshots = await ctx.db
          .query('serviceMetricSnapshots')
          .withIndex('by_service_and_capturedAt', (q) => q.eq('serviceId', connection._id))
          .order('desc')
          .take(HISTORY_LIMIT)
        const history = snapshots.map(({ ownerId: _snapshotOwnerId, ...snapshot }) => snapshot)
        return { connection, latest: history[0] ?? null, history: history.reverse() }
      }),
    )
    const {
      ownerId: _ownerId,
      normalizedName: _normalizedName,
      status: _status,
      collectionScheduleInitialized: _collectionScheduleInitialized,
      ...publicProject
    } = project
    return {
      project: {
        ...publicProject,
        collectionIntervalMinutes:
          publicProject.collectionIntervalMinutes ?? 15,
      },
      providers,
    }
  },
})
