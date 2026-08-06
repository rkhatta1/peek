/// <reference types="node" />

import { v } from 'convex/values'

import { authComponent } from './auth'
import { mutation, query } from './_generated/server'
import { evaluateSnapshot, type ProviderSnapshot } from './lib/monitoring'

const HISTORY_LIMIT = 96

function liveMode(provider: 'neon' | 'upstash') {
  if (provider === 'neon') {
    return Boolean(process.env.NEON_DATABASE_URL)
  }
  return Boolean(
    process.env.UPSTASH_EMAIL &&
      process.env.UPSTASH_API_KEY &&
      process.env.UPSTASH_DATABASE_ID,
  )
}

export const ensureWorkspace = mutation({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx)
    const existing = await ctx.db
      .query('workspaces')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .unique()

    if (existing) return existing._id

    const createdAt = Date.now()
    const workspaceId = await ctx.db.insert('workspaces', {
      ownerId: user._id,
      name: process.env.PEEK_WORKSPACE_NAME ?? 'Client infrastructure',
      createdAt,
    })

    await Promise.all([
      ctx.db.insert('connections', {
        workspaceId,
        ownerId: user._id,
        provider: 'neon',
        name: process.env.NEON_PROJECT_NAME ?? 'Neon Postgres',
        environment: process.env.NEON_ENVIRONMENT ?? 'Production',
        mode: liveMode('neon') ? 'live' : 'demo',
        active: true,
        createdAt,
      }),
      ctx.db.insert('connections', {
        workspaceId,
        ownerId: user._id,
        provider: 'upstash',
        name: process.env.UPSTASH_DATABASE_NAME ?? 'Upstash Redis',
        environment: process.env.UPSTASH_ENVIRONMENT ?? 'Staging',
        mode: liveMode('upstash') ? 'live' : 'demo',
        active: true,
        createdAt,
      }),
    ])

    return workspaceId
  },
})

export const getOverview = query({
  args: {},
  handler: async (ctx) => {
    const user = await authComponent.getAuthUser(ctx)
    const workspace = await ctx.db
      .query('workspaces')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .unique()

    if (!workspace) return null

    const connections = await ctx.db
      .query('connections')
      .withIndex('by_owner', (q) => q.eq('ownerId', user._id))
      .take(8)

    const providers = await Promise.all(
      connections.map(async (connection) => {
        const history = await ctx.db
          .query('metricSnapshots')
          .withIndex('by_connection_captured', (q) =>
            q.eq('connectionId', connection._id),
          )
          .order('desc')
          .take(HISTORY_LIMIT)
        const latest = history[0]
        const evaluation = latest
          ? evaluateSnapshot(latest as ProviderSnapshot)
          : null

        return {
          connection,
          latest,
          evaluation,
          history: history.reverse(),
        }
      }),
    )

    return { workspace, providers }
  },
})

export const getConnectionHistory = query({
  args: { connectionId: v.id('connections') },
  handler: async (ctx, args) => {
    const user = await authComponent.getAuthUser(ctx)
    const connection = await ctx.db.get(args.connectionId)
    if (!connection || connection.ownerId !== user._id) {
      throw new Error('Connection not found')
    }

    return await ctx.db
      .query('metricSnapshots')
      .withIndex('by_connection_captured', (q) =>
        q.eq('connectionId', args.connectionId),
      )
      .order('desc')
      .take(HISTORY_LIMIT)
  },
})
