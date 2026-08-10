import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation, type MutationCtx } from './_generated/server'
import {
  insertCheckTrigger,
  scheduledCheckAggregateValidator,
} from './lib/checkTriggers'

const ACTIVE = 'active' as const
const DEFAULT_COLLECTION_INTERVAL_MINUTES = 15
const DISPATCH_LIMIT = 25
const LEASE_MS = 15 * 60 * 1_000
const MINUTE_MS = 60_000

export const dispatchScheduledCollections = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const now = Date.now()
    await initializeLegacySchedules(ctx, now)
    const dueSchedules = await ctx.db
      .query('projectCollectionSchedules')
      .withIndex('by_nextCollectionAt', (q) => q.lte('nextCollectionAt', now))
      .take(DISPATCH_LIMIT)
    let dispatched = 0

    for (const schedule of dueSchedules) {
      const project = await ctx.db.get(schedule.projectId)
      if (
        !project ||
        project.ownerId !== schedule.ownerId ||
        project.status !== ACTIVE
      ) {
        await ctx.db.delete(schedule._id)
        continue
      }
      const runId = crypto.randomUUID()
      const leaseExpiresAt = now + LEASE_MS
      await ctx.db.patch(schedule._id, {
        runId,
        runStartedAt: now,
        leaseExpiresAt,
        nextCollectionAt: leaseExpiresAt,
        updatedAt: now,
      })
      await ctx.scheduler.runAfter(
        0,
        internal.collectors.collectScheduledProjectPage,
        {
          projectId: project._id,
          cursor: null,
          ownerId: project.ownerId,
          runId,
          triggeredAt: now,
        },
      )
      dispatched += 1
    }

    return dispatched
  },
})

export const heartbeatScheduledProjectRun = internalMutation({
  args: {
    projectId: v.id('projects'),
    runId: v.string(),
    triggeredAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireRunId(args.runId)
    const schedule = await ctx.db
      .query('projectCollectionSchedules')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    const now = Date.now()
    if (
      !schedule ||
      schedule.runId !== args.runId ||
      schedule.runStartedAt !== args.triggeredAt ||
      !schedule.leaseExpiresAt ||
      schedule.leaseExpiresAt <= now
    ) {
      return false
    }
    const leaseExpiresAt = now + LEASE_MS
    await ctx.db.patch(schedule._id, {
      leaseExpiresAt,
      nextCollectionAt: leaseExpiresAt,
      updatedAt: now,
    })
    return true
  },
})

export const advanceScheduledProjectRun = internalMutation({
  args: {
    projectId: v.id('projects'),
    runId: v.string(),
    completed: v.array(scheduledCheckAggregateValidator),
    pending: v.optional(scheduledCheckAggregateValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    triggeredAt: v.number(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    requireRunId(args.runId)
    const schedule = await ctx.db
      .query('projectCollectionSchedules')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .unique()
    const now = Date.now()
    if (
      !schedule ||
      schedule.runId !== args.runId ||
      schedule.runStartedAt !== args.triggeredAt ||
      !schedule.leaseExpiresAt ||
      schedule.leaseExpiresAt <= now
    ) {
      return false
    }
    const project = await ctx.db.get(args.projectId)
    if (
      !project ||
      project.ownerId !== schedule.ownerId ||
      project.status !== ACTIVE
    ) {
      await ctx.db.delete(schedule._id)
      return false
    }

    if (args.isDone) {
      for (const aggregate of args.completed) {
        await insertCheckTrigger(ctx, {
          source: 'scheduled',
          runId: args.runId,
          ...aggregate,
        })
      }
      const intervalMinutes =
        project.collectionIntervalMinutes ?? DEFAULT_COLLECTION_INTERVAL_MINUTES
      await ctx.db.patch(schedule._id, {
        nextCollectionAt: Math.max(
          now,
          args.triggeredAt + intervalMinutes * MINUTE_MS,
        ),
        runId: undefined,
        runStartedAt: undefined,
        leaseExpiresAt: undefined,
        updatedAt: now,
      })
      return true
    }

    const leaseExpiresAt = now + LEASE_MS
    await ctx.db.patch(schedule._id, {
      leaseExpiresAt,
      nextCollectionAt: leaseExpiresAt,
      updatedAt: now,
    })
    await ctx.scheduler.runAfter(
      0,
      internal.collectors.collectScheduledProjectPage,
      {
        projectId: args.projectId,
        cursor: args.continueCursor,
        ownerId: project.ownerId,
        ...(args.pending ? { pending: args.pending } : {}),
        runId: args.runId,
        triggeredAt: args.triggeredAt,
      },
    )
    return true
  },
})

async function initializeLegacySchedules(ctx: MutationCtx, now: number) {
  const projects = await ctx.db
    .query('projects')
    .withIndex('by_status_and_collectionScheduleInitialized', (q) =>
      q.eq('status', ACTIVE).eq('collectionScheduleInitialized', undefined),
    )
    .take(DISPATCH_LIMIT)

  for (const project of projects) {
    const existing = await ctx.db
      .query('projectCollectionSchedules')
      .withIndex('by_project', (q) => q.eq('projectId', project._id))
      .unique()
    if (!existing) {
      const intervalMinutes =
        project.collectionIntervalMinutes ?? DEFAULT_COLLECTION_INTERVAL_MINUTES
      await ctx.db.insert('projectCollectionSchedules', {
        projectId: project._id,
        ownerId: project.ownerId,
        nextCollectionAt: now + intervalMinutes * MINUTE_MS,
        updatedAt: now,
      })
    }
    await ctx.db.patch(project._id, {
      collectionScheduleInitialized: true,
      updatedAt: now,
    })
  }
}

function requireRunId(runId: string) {
  if (!runId || runId.length > 100) {
    throw new Error('INVALID_SCHEDULED_COLLECTION_RUN')
  }
}
