import { paginationOptsValidator, paginationResultValidator } from 'convex/server'
import { v } from 'convex/values'

import type { Doc } from './_generated/dataModel'
import { internalMutation, internalQuery, type QueryCtx } from './_generated/server'
import {
  activeProjectForOwner,
  normalizeEnvironment,
  normalizeName,
  requireActiveProjectForOwner,
} from './lib/domain'
import { insertCheckTrigger } from './lib/checkTriggers'
import { evaluateSnapshot } from './lib/monitoring'
import {
  encryptedCredentialsValidator,
  providerSnapshotValidator,
  providerValidator,
} from './lib/validators'

const ACTIVE = 'active' as const

const connectionContextValidator = v.object({
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  existing: v.union(
    v.null(),
    v.object({
      serviceId: v.id('serviceConnections'),
      provider: providerValidator,
      name: v.string(),
      environment: v.string(),
    }),
  ),
})

const collectionTargetValidator = v.object({
  serviceId: v.id('serviceConnections'),
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  ownerId: v.string(),
  provider: providerValidator,
  encryptedCredentials: encryptedCredentialsValidator,
})

async function collectionTargetForActiveProject(
  ctx: QueryCtx,
  service: Doc<'serviceConnections'>,
) {
  const credentials = await ctx.db
    .query('serviceCredentials')
    .withIndex('by_service', (q) => q.eq('serviceId', service._id))
    .unique()
  if (!credentials) return null
  return {
    serviceId: service._id,
    clientId: service.clientId,
    projectId: service.projectId,
    ownerId: service.ownerId,
    provider: service.provider,
    encryptedCredentials: {
      algorithm: credentials.algorithm,
      binding: credentials.binding,
      ciphertext: credentials.ciphertext,
      iv: credentials.iv,
      keyId: credentials.keyId,
    },
  }
}

export const getConnectionContext = internalQuery({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    serviceId: v.optional(v.id('serviceConnections')),
  },
  returns: connectionContextValidator,
  handler: async (ctx, args) => {
    const project = await requireActiveProjectForOwner(
      ctx,
      args.ownerId,
      args.projectId,
    )
    if (!args.serviceId) {
      return { clientId: project.clientId, projectId: project._id, existing: null }
    }
    const service = await ctx.db.get(args.serviceId)
    if (
      !service ||
      service.ownerId !== args.ownerId ||
      service.projectId !== project._id ||
      service.status !== ACTIVE
    ) {
      throw new Error('Service not found')
    }
    return {
      clientId: project.clientId,
      projectId: project._id,
      existing: {
        serviceId: service._id,
        provider: service.provider,
        name: service.name,
        environment: service.environment,
      },
    }
  },
})

export const listCollectionTargetsForProject = internalQuery({
  args: { ownerId: v.string(), projectId: v.id('projects') },
  returns: v.array(collectionTargetValidator),
  handler: async (ctx, args) => {
    await requireActiveProjectForOwner(ctx, args.ownerId, args.projectId)
    const services = await ctx.db
      .query('serviceConnections')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', args.projectId).eq('status', ACTIVE),
      )
      .take(20)
    const targets = await Promise.all(
      services
        .filter((service) => service.active)
        .map((service) => collectionTargetForActiveProject(ctx, service)),
    )
    return targets.filter((target) => target !== null)
  },
})

export const listCollectionTargetsForProjectPage = internalQuery({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(collectionTargetValidator),
  handler: async (ctx, args) => {
    await requireActiveProjectForOwner(ctx, args.ownerId, args.projectId)
    const page = await ctx.db
      .query('serviceConnections')
      .withIndex('by_active_and_status_and_project', (q) =>
        q
          .eq('active', true)
          .eq('status', ACTIVE)
          .eq('projectId', args.projectId),
      )
      .paginate(args.paginationOpts)
    const targets = await Promise.all(
      page.page.map((service) =>
        collectionTargetForActiveProject(ctx, service),
      ),
    )
    return { ...page, page: targets.filter((target) => target !== null) }
  },
})

export const commitConnectedService = internalMutation({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    serviceId: v.optional(v.id('serviceConnections')),
    provider: providerValidator,
    name: v.string(),
    environment: v.string(),
    encryptedCredentials: encryptedCredentialsValidator,
    snapshot: providerSnapshotValidator,
  },
  returns: v.id('serviceConnections'),
  handler: async (ctx, args) => {
    const project = await requireActiveProjectForOwner(
      ctx,
      args.ownerId,
      args.projectId,
    )
    const { name, normalizedName } = normalizeName(args.name, 'Service')
    const environment = normalizeEnvironment(args.environment)
    const now = Date.now()
    const runId = crypto.randomUUID()
    let serviceId = args.serviceId

    if (serviceId) {
      const service = await ctx.db.get(serviceId)
      if (
        !service ||
        service.ownerId !== args.ownerId ||
        service.projectId !== project._id ||
        service.provider !== args.provider ||
        service.status !== ACTIVE
      ) {
        throw new Error('Service not found')
      }
      await ctx.db.patch(serviceId, {
        name,
        normalizedName,
        environment,
        active: true,
        credentialState: 'valid',
        lastValidatedAt: now,
        lastCollectedAt: args.snapshot.capturedAt,
        lastErrorCode: undefined,
        updatedAt: now,
      })
    } else {
      const duplicate = await ctx.db
        .query('serviceConnections')
        .withIndex('by_project_and_provider_and_normalizedName_and_status', (q) =>
          q
            .eq('projectId', project._id)
            .eq('provider', args.provider)
            .eq('normalizedName', normalizedName)
            .eq('status', ACTIVE),
        )
        .unique()
      if (duplicate) throw new Error('A service with this name already exists')
      serviceId = await ctx.db.insert('serviceConnections', {
        clientId: project.clientId,
        projectId: project._id,
        ownerId: args.ownerId,
        provider: args.provider,
        name,
        normalizedName,
        environment,
        active: true,
        status: ACTIVE,
        credentialState: 'valid',
        lastValidatedAt: now,
        lastCollectedAt: args.snapshot.capturedAt,
        createdAt: now,
        updatedAt: now,
      })
    }

    const existingCredentials = await ctx.db
      .query('serviceCredentials')
      .withIndex('by_service', (q) => q.eq('serviceId', serviceId))
      .unique()
    const credentialRecord = {
      serviceId,
      ownerId: args.ownerId,
      ...args.encryptedCredentials,
      createdAt: existingCredentials?.createdAt ?? now,
      updatedAt: now,
    }
    if (existingCredentials) {
      await ctx.db.replace(existingCredentials._id, credentialRecord)
    } else {
      await ctx.db.insert('serviceCredentials', credentialRecord)
    }

    await ctx.db.insert('serviceMetricSnapshots', {
      clientId: project.clientId,
      projectId: project._id,
      serviceId,
      ownerId: args.ownerId,
      runId,
      serviceName: name,
      environment,
      ...args.snapshot,
    })
    const evaluation = evaluateSnapshot(args.snapshot, {
      now: args.snapshot.capturedAt,
    })
    const unavailable = args.snapshot.status === 'unavailable'
    await insertCheckTrigger(ctx, {
      ownerId: args.ownerId,
      runId,
      projectId: project._id,
      source: 'connection',
      triggeredAt: args.snapshot.capturedAt,
      completedAt: Math.max(args.snapshot.capturedAt, Date.now()),
      serviceCount: 1,
      operationalCount:
        !unavailable && evaluation.status === 'operational' ? 1 : 0,
      attentionCount:
        !unavailable && evaluation.status !== 'operational' ? 1 : 0,
      unavailableCount: unavailable ? 1 : 0,
    })
    return serviceId
  },
})

export const markCollection = internalMutation({
  args: {
    serviceId: v.id('serviceConnections'),
    runId: v.string(),
    snapshot: providerSnapshotValidator,
    errorCode: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const service = await ctx.db.get(args.serviceId)
    if (!service || service.status !== ACTIVE) return null
    const project = await activeProjectForOwner(
      ctx,
      service.ownerId,
      service.projectId,
    )
    if (!project) return null
    await ctx.db.insert('serviceMetricSnapshots', {
      clientId: service.clientId,
      projectId: service.projectId,
      serviceId: service._id,
      ownerId: service.ownerId,
      runId: args.runId,
      serviceName: service.name,
      environment: service.environment,
      ...args.snapshot,
      errorCode: args.errorCode,
    })
    await ctx.db.patch(service._id, {
      credentialState: args.errorCode?.startsWith('CREDENTIAL_') ? 'error' : 'valid',
      lastCollectedAt: args.snapshot.capturedAt,
      lastErrorCode: args.errorCode,
      updatedAt: Date.now(),
    })
    return null
  },
})
