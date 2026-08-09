import { v } from 'convex/values'

import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { requireActiveProjectForOwner, requireOwner } from './lib/domain'
import { codeConnectionValidator } from './lib/validators'

const ACTIVE = 'active' as const

export const listByProject = query({
  args: { projectId: v.id('projects') },
  returns: v.array(codeConnectionValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const connections = await ctx.db
      .query('codeConnections')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', args.projectId).eq('status', ACTIVE),
      )
      .take(2)
    return connections.map(
      ({
        ownerId: _ownerId,
        status: _status,
        lastSyncedHeadSha: _lastSyncedHeadSha,
        ...connection
      }) => connection,
    )
  },
})

export const remove = mutation({
  args: { connectionId: v.id('codeConnections') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const connection = await ctx.db.get(args.connectionId)
    if (
      !connection ||
      connection.ownerId !== ownerId ||
      connection.status !== ACTIVE
    ) {
      throw new Error('Code connection not found')
    }
    await requireActiveProjectForOwner(ctx, ownerId, connection.projectId)
    const credentials = await ctx.db
      .query('codeConnectionCredentials')
      .withIndex('by_connection', (q) =>
        q.eq('connectionId', connection._id),
      )
      .unique()
    if (credentials) await ctx.db.delete(credentials._id)
    await ctx.db.patch(connection._id, {
      status: 'deleted',
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.cleanup.deletedCodeConnection, {
      connectionId: connection._id,
      ownerId,
    })
    return null
  },
})
