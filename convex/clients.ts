import { v } from 'convex/values'

import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import { normalizeName, requireOwner } from './lib/domain'
import { clientValidator } from './lib/validators'

const ACTIVE = 'active' as const
const CASCADE_LIMIT = 100

export const list = query({
  args: {},
  returns: v.array(clientValidator),
  handler: async (ctx) => {
    const ownerId = await requireOwner(ctx)
    const clients = await ctx.db
      .query('clients')
      .withIndex('by_owner_and_status', (q) => q.eq('ownerId', ownerId).eq('status', ACTIVE))
      .take(100)
    return clients.map(({ ownerId: _ownerId, normalizedName: _normalizedName, status: _status, ...client }) => client)
  },
})

export const create = mutation({
  args: { name: v.string() },
  returns: v.id('clients'),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const { name, normalizedName } = normalizeName(args.name, 'Client')
    const duplicate = await ctx.db
      .query('clients')
      .withIndex('by_owner_and_normalizedName_and_status', (q) =>
        q.eq('ownerId', ownerId).eq('normalizedName', normalizedName).eq('status', ACTIVE),
      )
      .unique()
    if (duplicate) throw new Error('A client with this name already exists')
    const now = Date.now()
    return await ctx.db.insert('clients', {
      ownerId,
      name,
      normalizedName,
      status: ACTIVE,
      createdAt: now,
      updatedAt: now,
    })
  },
})

export const update = mutation({
  args: { clientId: v.id('clients'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const client = await ctx.db.get(args.clientId)
    if (!client || client.ownerId !== ownerId || client.status !== ACTIVE) {
      throw new Error('Client not found')
    }
    const { name, normalizedName } = normalizeName(args.name, 'Client')
    const duplicate = await ctx.db
      .query('clients')
      .withIndex('by_owner_and_normalizedName_and_status', (q) =>
        q.eq('ownerId', ownerId).eq('normalizedName', normalizedName).eq('status', ACTIVE),
      )
      .unique()
    if (duplicate && duplicate._id !== client._id) {
      throw new Error('A client with this name already exists')
    }
    await ctx.db.patch(args.clientId, { name, normalizedName, updatedAt: Date.now() })
    return null
  },
})

export const remove = mutation({
  args: { clientId: v.id('clients') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const client = await ctx.db.get(args.clientId)
    if (!client || client.ownerId !== ownerId || client.status !== ACTIVE) {
      throw new Error('Client not found')
    }
    const now = Date.now()
    await ctx.db.patch(args.clientId, { status: 'deleted', updatedAt: now })

    const [projects, services, codeConnections] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_client_and_status', (q) =>
          q.eq('clientId', args.clientId).eq('status', ACTIVE),
        )
        .take(CASCADE_LIMIT),
      ctx.db
        .query('serviceConnections')
        .withIndex('by_client_and_status', (q) =>
          q.eq('clientId', args.clientId).eq('status', ACTIVE),
        )
        .take(CASCADE_LIMIT),
      ctx.db
        .query('codeConnections')
        .withIndex('by_client_and_status', (q) =>
          q.eq('clientId', args.clientId).eq('status', ACTIVE),
        )
        .take(CASCADE_LIMIT),
    ])

    for (const project of projects) {
      await ctx.db.patch(project._id, { status: 'deleted', updatedAt: now })
    }
    for (const service of services) {
      await ctx.db.patch(service._id, {
        active: false,
        status: 'deleted',
        updatedAt: now,
      })
      const credentials = await ctx.db
        .query('serviceCredentials')
        .withIndex('by_service', (q) => q.eq('serviceId', service._id))
        .unique()
      if (credentials) await ctx.db.delete(credentials._id)
    }
    for (const connection of codeConnections) {
      const credentials = await ctx.db
        .query('codeConnectionCredentials')
        .withIndex('by_connection', (q) =>
          q.eq('connectionId', connection._id),
        )
        .unique()
      if (credentials) await ctx.db.delete(credentials._id)
      await ctx.db.patch(connection._id, { status: 'deleted', updatedAt: now })
    }

    await ctx.scheduler.runAfter(0, internal.cleanup.deletedClient, {
      clientId: args.clientId,
      ownerId,
    })
    return null
  },
})
