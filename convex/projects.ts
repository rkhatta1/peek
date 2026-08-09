import { v } from 'convex/values'

import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import {
  normalizeName,
  requireActiveProjectForOwner,
  requireOwner,
} from './lib/domain'
import { projectValidator } from './lib/validators'

const ACTIVE = 'active' as const
const CASCADE_LIMIT = 100

export const listByClient = query({
  args: { clientId: v.id('clients') },
  returns: v.array(projectValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const client = await ctx.db.get(args.clientId)
    if (!client || client.ownerId !== ownerId || client.status !== ACTIVE) {
      throw new Error('Client not found')
    }
    const projects = await ctx.db
      .query('projects')
      .withIndex('by_client_and_status', (q) =>
        q.eq('clientId', args.clientId).eq('status', ACTIVE),
      )
      .take(100)
    return projects.map(({ ownerId: _ownerId, normalizedName: _normalizedName, status: _status, ...project }) => project)
  },
})

export const create = mutation({
  args: { clientId: v.id('clients'), name: v.string() },
  returns: v.id('projects'),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const client = await ctx.db.get(args.clientId)
    if (!client || client.ownerId !== ownerId || client.status !== ACTIVE) {
      throw new Error('Client not found')
    }
    const { name, normalizedName } = normalizeName(args.name, 'Project')
    const duplicate = await ctx.db
      .query('projects')
      .withIndex('by_client_and_normalizedName_and_status', (q) =>
        q.eq('clientId', args.clientId).eq('normalizedName', normalizedName).eq('status', ACTIVE),
      )
      .unique()
    if (duplicate) throw new Error('A project with this name already exists')
    const now = Date.now()
    return await ctx.db.insert('projects', {
      clientId: args.clientId,
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
  args: { projectId: v.id('projects'), name: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const project = await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const { name, normalizedName } = normalizeName(args.name, 'Project')
    const duplicate = await ctx.db
      .query('projects')
      .withIndex('by_client_and_normalizedName_and_status', (q) =>
        q.eq('clientId', project.clientId).eq('normalizedName', normalizedName).eq('status', ACTIVE),
      )
      .unique()
    if (duplicate && duplicate._id !== project._id) {
      throw new Error('A project with this name already exists')
    }
    await ctx.db.patch(args.projectId, { name, normalizedName, updatedAt: Date.now() })
    return null
  },
})

export const remove = mutation({
  args: { projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const now = Date.now()
    await ctx.db.patch(args.projectId, { status: 'deleted', updatedAt: now })
    const [services, codeConnections] = await Promise.all([
      ctx.db
        .query('serviceConnections')
        .withIndex('by_project_and_status', (q) =>
          q.eq('projectId', args.projectId).eq('status', ACTIVE),
        )
        .take(CASCADE_LIMIT),
      ctx.db
        .query('codeConnections')
        .withIndex('by_project_and_status', (q) =>
          q.eq('projectId', args.projectId).eq('status', ACTIVE),
        )
        .take(CASCADE_LIMIT),
    ])
    for (const service of services) {
      await ctx.db.patch(service._id, { active: false, status: 'deleted', updatedAt: now })
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
    await ctx.scheduler.runAfter(0, internal.cleanup.deletedProject, {
      ownerId,
      projectId: args.projectId,
    })
    return null
  },
})
