import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { internalMutation, query } from './_generated/server'
import { requireActiveProjectForOwner, requireOwner } from './lib/domain'
import { insertCheckTrigger } from './lib/checkTriggers'
import { enforceLedgerPageSize } from './lib/pagination'
import { providerValidator, rawStatusValidator } from './lib/validators'

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

const checkEventValidator = v.object({
  _id: v.id('serviceMetricSnapshots'),
  _creationTime: v.number(),
  serviceId: v.id('serviceConnections'),
  serviceName: v.string(),
  environment: v.string(),
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

const DETAILS_LIMIT = 100

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
    enforceLedgerPageSize(args.paginationOpts.numItems)
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
      page: result.page.map(
        ({ ownerId: _ownerId, runId: _runId, ...trigger }) => trigger,
      ),
    }
  },
})

export const getDetails = query({
  args: { triggerId: v.id('checkTriggers') },
  returns: v.object({
    trigger: checkTriggerValidator,
    events: v.array(checkEventValidator),
    truncated: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const trigger = await ctx.db.get(args.triggerId)
    if (!trigger || trigger.ownerId !== ownerId) {
      throw new Error('Trigger not found')
    }
    await requireActiveProjectForOwner(ctx, ownerId, trigger.projectId)
    const snapshots = trigger.runId
      ? await ctx.db
          .query('serviceMetricSnapshots')
          .withIndex('by_runId', (q) => q.eq('runId', trigger.runId))
          .take(DETAILS_LIMIT + 1)
      : await ctx.db
          .query('serviceMetricSnapshots')
          .withIndex('by_project_and_capturedAt', (q) =>
            q
              .eq('projectId', trigger.projectId)
              .gte('capturedAt', trigger.triggeredAt)
              .lte('capturedAt', trigger.completedAt),
          )
          .take(DETAILS_LIMIT + 1)
    const visibleSnapshots = snapshots
      .filter(
        (snapshot) =>
          snapshot.ownerId === ownerId &&
          snapshot.projectId === trigger.projectId,
      )
      .slice(0, DETAILS_LIMIT)
    const events = await Promise.all(
      visibleSnapshots.map(async (snapshot) => {
        const service =
          snapshot.serviceName && snapshot.environment
            ? null
            : await ctx.db.get(snapshot.serviceId)
        const {
          clientId: _clientId,
          projectId: _projectId,
          ownerId: _snapshotOwnerId,
          runId: _runId,
          ...event
        } = snapshot
        return {
          ...event,
          serviceName: snapshot.serviceName ?? service?.name ?? 'Unknown service',
          environment: snapshot.environment ?? service?.environment ?? 'Unknown',
        }
      }),
    )
    const { ownerId: _ownerId, runId: _runId, ...publicTrigger } = trigger
    return {
      trigger: publicTrigger,
      events,
      truncated: snapshots.length > DETAILS_LIMIT,
    }
  },
})

export const record = internalMutation({
  args: {
    ownerId: v.string(),
    runId: v.optional(v.string()),
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
