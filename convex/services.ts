import { v } from 'convex/values'

import { internal } from './_generated/api'
import { mutation, query } from './_generated/server'
import {
  normalizeEnvironment,
  normalizeName,
  requireActiveProjectForOwner,
  requireOwner,
} from './lib/domain'
import { serviceValidator } from './lib/validators'

const ACTIVE = 'active' as const

export const listByProject = query({
  args: { projectId: v.id('projects') },
  returns: v.array(serviceValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    const services = await ctx.db
      .query('serviceConnections')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', args.projectId).eq('status', ACTIVE),
      )
      .take(20)
    return services.map(
      ({ ownerId: _ownerId, normalizedName: _normalizedName, status: _status, ...service }) =>
        service,
    )
  },
})

export const update = mutation({
  args: {
    serviceId: v.id('serviceConnections'),
    name: v.string(),
    environment: v.string(),
    active: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const service = await ctx.db.get(args.serviceId)
    if (!service || service.ownerId !== ownerId || service.status !== ACTIVE) {
      throw new Error('Service not found')
    }
    await requireActiveProjectForOwner(ctx, ownerId, service.projectId)
    const { name, normalizedName } = normalizeName(args.name, 'Service')
    const environment = normalizeEnvironment(args.environment)
    const duplicate = await ctx.db
      .query('serviceConnections')
      .withIndex('by_project_and_provider_and_normalizedName_and_status', (q) =>
        q
          .eq('projectId', service.projectId)
          .eq('provider', service.provider)
          .eq('normalizedName', normalizedName)
          .eq('status', ACTIVE),
      )
      .unique()
    if (duplicate && duplicate._id !== service._id) {
      throw new Error('A service with this name already exists')
    }
    await ctx.db.patch(args.serviceId, {
      name,
      normalizedName,
      environment,
      active: args.active,
      updatedAt: Date.now(),
    })
    return null
  },
})

export const remove = mutation({
  args: { serviceId: v.id('serviceConnections') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const service = await ctx.db.get(args.serviceId)
    if (!service || service.ownerId !== ownerId || service.status !== ACTIVE) {
      throw new Error('Service not found')
    }
    await requireActiveProjectForOwner(ctx, ownerId, service.projectId)
    await ctx.db.patch(args.serviceId, {
      active: false,
      status: 'deleted',
      updatedAt: Date.now(),
    })
    const credentials = await ctx.db
      .query('serviceCredentials')
      .withIndex('by_service', (q) => q.eq('serviceId', args.serviceId))
      .unique()
    if (credentials) await ctx.db.delete(credentials._id)
    await ctx.scheduler.runAfter(0, internal.cleanup.deletedService, {
      ownerId,
      serviceId: args.serviceId,
    })
    return null
  },
})
