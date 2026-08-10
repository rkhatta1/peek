import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env, internalAction, type ActionCtx } from './_generated/server'
import { requireOwner } from './lib/domain'
import {
  foldScheduledPage,
  scheduledCheckAggregateValidator,
  type ScheduledCheckAggregate,
} from './lib/checkTriggers'
import { collectProvider, providerErrorCode, unavailableSnapshot } from './lib/providers'
import { evaluateSnapshot } from './lib/monitoring'
import { decryptCredentials, type EncryptedCredentials } from './lib/secrets'
import { providerValidator } from './lib/validators'

type CollectionTarget = {
  serviceId: Id<'serviceConnections'>
  clientId: Id<'clients'>
  projectId: Id<'projects'>
  ownerId: string
  provider: 'neon' | 'upstash'
  encryptedCredentials: EncryptedCredentials
}

const collectionResultValidator = v.object({
  serviceId: v.id('serviceConnections'),
  provider: providerValidator,
  stored: v.boolean(),
})

function encryptionKeys() {
  return [
    env.PEEK_CREDENTIAL_ENCRYPTION_KEY,
    env.PEEK_CREDENTIAL_PREVIOUS_ENCRYPTION_KEY,
  ].filter((key): key is string => Boolean(key))
}

async function collectTarget(ctx: ActionCtx, target: CollectionTarget) {
  let outcome: 'operational' | 'attention' | 'unavailable'
  try {
    const credentials = await decryptCredentials(
      target.encryptedCredentials,
      target.ownerId,
      encryptionKeys(),
    )
    if (credentials.provider !== target.provider) throw new Error('CREDENTIAL_PROVIDER_MISMATCH')
    const snapshot = await collectProvider(credentials)
    const evaluation = evaluateSnapshot(snapshot, { now: snapshot.capturedAt })
    outcome =
      snapshot.status === 'unavailable'
        ? 'unavailable'
        : evaluation.status === 'operational'
          ? 'operational'
          : 'attention'
    await ctx.runMutation(internal.serviceInternal.markCollection, {
      serviceId: target.serviceId,
      snapshot,
    })
  } catch (error) {
    outcome = 'unavailable'
    const errorCode =
      error instanceof Error && error.message.startsWith('CREDENTIAL_')
        ? error.message
        : providerErrorCode(error)
    await ctx.runMutation(internal.serviceInternal.markCollection, {
      serviceId: target.serviceId,
      snapshot: unavailableSnapshot(target.provider),
      errorCode,
    })
  }
  return {
    serviceId: target.serviceId,
    provider: target.provider,
    stored: true,
    outcome,
  }
}

async function collectInBatches(
  ctx: ActionCtx,
  targets: CollectionTarget[],
  source: 'manual' | 'scheduled',
) {
  const results: Awaited<ReturnType<typeof collectTarget>>[] = []
  const projectIds = [...new Set(targets.map((target) => target.projectId))]
  for (const projectId of projectIds) {
    const projectTargets = targets.filter((target) => target.projectId === projectId)
    const { aggregate, results: projectResults } = await collectProject(
      ctx,
      projectTargets,
    )
    if (aggregate) {
      await ctx.runMutation(internal.checkTriggers.record, {
        source,
        ...aggregate,
      })
    }
    results.push(...projectResults)
  }
  return results
}

async function collectProject(
  ctx: ActionCtx,
  targets: CollectionTarget[],
  triggeredAt = Date.now(),
) {
  const results: Awaited<ReturnType<typeof collectTarget>>[] = []
  for (let index = 0; index < targets.length; index += 5) {
    results.push(
      ...(await Promise.all(
        targets.slice(index, index + 5).map((target) => collectTarget(ctx, target)),
      )),
    )
  }
  const first = targets[0]
  const aggregate: ScheduledCheckAggregate<Id<'projects'>> | null = first
    ? {
        ownerId: first.ownerId,
        projectId: first.projectId,
        triggeredAt,
        completedAt: Math.max(triggeredAt, Date.now()),
        serviceCount: results.length,
        operationalCount: results.filter(
          (result) => result.outcome === 'operational',
        ).length,
        attentionCount: results.filter(
          (result) => result.outcome === 'attention',
        ).length,
        unavailableCount: results.filter(
          (result) => result.outcome === 'unavailable',
        ).length,
      }
    : null
  return { aggregate, results }
}

export const refreshNow = action({
  args: { projectId: v.id('projects') },
  returns: v.array(collectionResultValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const targets: CollectionTarget[] = await ctx.runQuery(
      internal.serviceInternal.listCollectionTargetsForProject,
      { ownerId, projectId: args.projectId },
    )
    const results = await collectInBatches(ctx, targets, 'manual')
    return results.map(({ outcome: _outcome, ...result }) => result)
  },
})

export const collectScheduledProjectPage = internalAction({
  args: {
    projectId: v.id('projects'),
    cursor: v.union(v.null(), v.string()),
    ownerId: v.string(),
    pending: v.optional(scheduledCheckAggregateValidator),
    runId: v.string(),
    triggeredAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const active = await ctx.runMutation(
      internal.collectorInternal.heartbeatScheduledProjectRun,
      {
        projectId: args.projectId,
        runId: args.runId,
        triggeredAt: args.triggeredAt,
      },
    )
    if (!active) return null
    const page: {
      page: CollectionTarget[]
      isDone: boolean
      continueCursor: string
    } = await ctx.runQuery(
      internal.serviceInternal.listCollectionTargetsForProjectPage,
      {
        ownerId: args.ownerId,
        projectId: args.projectId,
        paginationOpts: { cursor: args.cursor, numItems: 25 },
      },
    )
    const { aggregate } = await collectProject(
      ctx,
      page.page,
      args.triggeredAt,
    )
    const folded = foldScheduledPage(
      args.pending ?? null,
      aggregate ? [aggregate] : [],
      page.isDone,
    )
    await ctx.runMutation(
      internal.collectorInternal.advanceScheduledProjectRun,
      {
      projectId: args.projectId,
      runId: args.runId,
      completed: folded.completed,
      ...(folded.pending ? { pending: folded.pending } : {}),
      isDone: page.isDone,
      continueCursor: page.continueCursor,
      triggeredAt: args.triggeredAt,
      },
    )
    return null
  },
})
