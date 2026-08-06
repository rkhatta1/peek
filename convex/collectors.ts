/// <reference types="node" />

import { neon } from '@neondatabase/serverless'
import { authComponent } from './auth'
import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, internalAction, type ActionCtx } from './_generated/server'
import {
  normalizeNeonPostgresStats,
  normalizeUpstashStats,
  type ProviderSnapshot,
} from './lib/monitoring'

type ConnectionTarget = {
  _id: Id<'connections'>
  workspaceId: Id<'workspaces'>
  ownerId: string
  provider: 'neon' | 'upstash'
  mode: 'demo' | 'live'
}

type CollectionResult = {
  provider: 'neon' | 'upstash'
  stored: boolean
}

function unavailableSnapshot(provider: 'neon' | 'upstash'): ProviderSnapshot {
  const shared = {
    capturedAt: Date.now(),
    status: 'unavailable' as const,
    connections: 0,
    cacheHitRatio: 0,
  }

  return provider === 'neon'
    ? {
        ...shared,
        provider,
        deadlocks: 0,
        logicalSizeBytes: 0,
        queryInsightsEnabled: false,
      }
    : {
        ...shared,
        provider,
        requestCount: 0,
        storageBytes: 0,
        p99LatencyMs: 0,
      }
}

async function collectNeon() {
  const databaseUrl = process.env.NEON_DATABASE_URL
  if (!databaseUrl) return unavailableSnapshot('neon')

  const sql = neon(databaseUrl)
  const [stats] = await sql`
    SELECT
      numbackends,
      xact_commit,
      xact_rollback,
      blks_read,
      blks_hit,
      deadlocks,
      temp_bytes,
      pg_database_size(current_database()) AS logical_size_bytes,
      EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) AS query_insights_enabled
    FROM pg_stat_database
    WHERE datname = current_database()
  `

  return normalizeNeonPostgresStats({
    capturedAt: Date.now(),
    stats: {
      numbackends: stats.numbackends,
      xact_commit: stats.xact_commit,
      xact_rollback: stats.xact_rollback,
      blks_read: stats.blks_read,
      blks_hit: stats.blks_hit,
      deadlocks: stats.deadlocks,
      temp_bytes: stats.temp_bytes,
    },
    logicalSizeBytes: Number(stats.logical_size_bytes),
    queryInsightsEnabled: Boolean(stats.query_insights_enabled),
  })
}

async function collectUpstash() {
  const email = process.env.UPSTASH_EMAIL
  const apiKey = process.env.UPSTASH_API_KEY
  const databaseId = process.env.UPSTASH_DATABASE_ID
  if (!email || !apiKey || !databaseId) return unavailableSnapshot('upstash')

  const response = await fetch(
    `https://api.upstash.com/v2/redis/stats/${encodeURIComponent(databaseId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${btoa(`${email}:${apiKey}`)}`,
      },
    },
  )
  if (!response.ok) throw new Error(`UPSTASH_HTTP_${response.status}`)

  return normalizeUpstashStats({
    capturedAt: Date.now(),
    stats: await response.json(),
  })
}

async function collectTarget(ctx: ActionCtx, target: ConnectionTarget) {
  if (target.mode === 'demo') return { provider: target.provider, stored: false }

  try {
    const snapshot =
      target.provider === 'neon' ? await collectNeon() : await collectUpstash()
    await ctx.runMutation(internal.monitoringInternal.recordSnapshot, {
      workspaceId: target.workspaceId,
      connectionId: target._id,
      ownerId: target.ownerId,
      ...snapshot,
    })
    return { provider: target.provider, stored: true }
  } catch (error) {
    const snapshot = unavailableSnapshot(target.provider)
    await ctx.runMutation(internal.monitoringInternal.recordSnapshot, {
      workspaceId: target.workspaceId,
      connectionId: target._id,
      ownerId: target.ownerId,
      ...snapshot,
      errorCode:
        error instanceof Error && error.message.startsWith('UPSTASH_HTTP_')
          ? error.message
          : 'COLLECTION_FAILED',
    })
    return { provider: target.provider, stored: true }
  }
}

export const refreshNow = action({
  args: {},
  handler: async (ctx): Promise<CollectionResult[]> => {
    const user = await authComponent.getAuthUser(ctx)
    const targets: ConnectionTarget[] = await ctx.runQuery(
      internal.monitoringInternal.listActiveConnectionsForOwner,
      { ownerId: user._id },
    )
    return await Promise.all(targets.map((target) => collectTarget(ctx, target)))
  },
})

export const collectScheduled = internalAction({
  args: {},
  handler: async (ctx): Promise<CollectionResult[]> => {
    const targets: ConnectionTarget[] = await ctx.runQuery(
      internal.monitoringInternal.listActiveConnections,
      {},
    )
    return await Promise.all(targets.map((target) => collectTarget(ctx, target)))
  },
})
