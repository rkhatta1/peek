import { v } from 'convex/values'

import { internal } from './_generated/api'
import { internalMutation } from './_generated/server'
import { incrementLedgerTotals } from './lib/ledgerTotals'

const BATCH_SIZE = 100

export const deletedService = internalMutation({
  args: { ownerId: v.string(), serviceId: v.id('serviceConnections') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const snapshots = await ctx.db
      .query('serviceMetricSnapshots')
      .withIndex('by_service_and_capturedAt', (q) => q.eq('serviceId', args.serviceId))
      .take(BATCH_SIZE)
    for (const snapshot of snapshots) {
      if (snapshot.ownerId === args.ownerId) await ctx.db.delete(snapshot._id)
    }
    if (snapshots.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deletedService, args)
    }
    return null
  },
})

export const deletedCodeConnection = internalMutation({
  args: { ownerId: v.string(), connectionId: v.id('codeConnections') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const commits = await ctx.db
      .query('agentCommits')
      .withIndex('by_connection_and_sha', (q) =>
        q.eq('connectionId', args.connectionId),
      )
      .take(BATCH_SIZE)
    let deleted = 0
    let scope: (typeof commits)[number] | undefined
    for (const commit of commits) {
      if (commit.ownerId !== args.ownerId) continue
      scope ??= commit
      await ctx.db.delete(commit._id)
      deleted += 1
    }
    if (scope && deleted) {
      await incrementLedgerTotals(
        ctx,
        {
          clientId: scope.clientId,
          projectId: scope.projectId,
          ownerId: args.ownerId,
        },
        { agentCommits: -deleted },
      )
    }
    if (commits.length === BATCH_SIZE) {
      await ctx.scheduler.runAfter(
        0,
        internal.cleanup.deletedCodeConnection,
        args,
      )
    }
    return null
  },
})

export const deletedProject = internalMutation({
  args: { ownerId: v.string(), projectId: v.id('projects') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [
      services,
      codeConnections,
      events,
      commits,
      triggers,
      totals,
      token,
      endpoint,
    ] = await Promise.all([
      ctx.db
        .query('serviceConnections')
        .withIndex('by_project_and_status', (q) =>
          q.eq('projectId', args.projectId).eq('status', 'active'),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('codeConnections')
        .withIndex('by_project_and_status', (q) =>
          q.eq('projectId', args.projectId).eq('status', 'deleted'),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('agentEvents')
        .withIndex('by_project_and_receivedAt', (q) =>
          q.eq('projectId', args.projectId),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('agentCommits')
        .withIndex('by_project_and_committedAt', (q) =>
          q.eq('projectId', args.projectId),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('checkTriggers')
        .withIndex('by_project_and_triggeredAt', (q) =>
          q.eq('projectId', args.projectId),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('ledgerTotals')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .unique(),
      ctx.db
        .query('agentApiTokens')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .unique(),
      ctx.db
        .query('agentEndpoints')
        .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
        .unique(),
    ])
    for (const service of services) {
      if (service.ownerId !== args.ownerId) continue
      await ctx.db.patch(service._id, {
        active: false,
        status: 'deleted',
        updatedAt: Date.now(),
      })
      const credentials = await ctx.db
        .query('serviceCredentials')
        .withIndex('by_service', (q) => q.eq('serviceId', service._id))
        .unique()
      if (credentials) await ctx.db.delete(credentials._id)
      await ctx.scheduler.runAfter(0, internal.cleanup.deletedService, {
        ownerId: args.ownerId,
        serviceId: service._id,
      })
    }
    for (const connection of codeConnections) {
      if (connection.ownerId !== args.ownerId) continue
      const credentials = await ctx.db
        .query('codeConnectionCredentials')
        .withIndex('by_connection', (q) =>
          q.eq('connectionId', connection._id),
        )
        .unique()
      if (credentials) await ctx.db.delete(credentials._id)
      await ctx.db.delete(connection._id)
    }
    const snapshots = await ctx.db
      .query('serviceMetricSnapshots')
      .withIndex('by_project', (q) => q.eq('projectId', args.projectId))
      .take(BATCH_SIZE)
    for (const snapshot of snapshots) {
      if (snapshot.ownerId === args.ownerId) await ctx.db.delete(snapshot._id)
    }
    for (const event of events) {
      if (event.ownerId === args.ownerId) await ctx.db.delete(event._id)
    }
    for (const commit of commits) {
      if (commit.ownerId === args.ownerId) await ctx.db.delete(commit._id)
    }
    for (const trigger of triggers) {
      if (trigger.ownerId === args.ownerId) await ctx.db.delete(trigger._id)
    }
    if (totals?.ownerId === args.ownerId) await ctx.db.delete(totals._id)
    if (token?.ownerId === args.ownerId) await ctx.db.delete(token._id)
    if (endpoint?.ownerId === args.ownerId) await ctx.db.delete(endpoint._id)
    if (
      services.length === BATCH_SIZE ||
      codeConnections.length === BATCH_SIZE ||
      snapshots.length === BATCH_SIZE ||
      events.length === BATCH_SIZE ||
      commits.length === BATCH_SIZE ||
      triggers.length === BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deletedProject, args)
    }
    return null
  },
})

export const deletedClient = internalMutation({
  args: { ownerId: v.string(), clientId: v.id('clients') },
  returns: v.null(),
  handler: async (ctx, args) => {
    const [
      projects,
      services,
      activeCodeConnections,
      deletedCodeConnections,
      snapshots,
      agentEvents,
      agentCommits,
      checkTriggers,
      ledgerTotals,
      agentTokens,
      agentEndpoints,
    ] = await Promise.all([
      ctx.db
        .query('projects')
        .withIndex('by_client_and_status', (q) =>
          q.eq('clientId', args.clientId).eq('status', 'active'),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('serviceConnections')
        .withIndex('by_client_and_status', (q) =>
          q.eq('clientId', args.clientId).eq('status', 'active'),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('codeConnections')
        .withIndex('by_client_and_status', (q) =>
          q.eq('clientId', args.clientId).eq('status', 'active'),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('codeConnections')
        .withIndex('by_client_and_status', (q) =>
          q.eq('clientId', args.clientId).eq('status', 'deleted'),
        )
        .take(BATCH_SIZE),
      ctx.db
        .query('serviceMetricSnapshots')
        .withIndex('by_client', (q) => q.eq('clientId', args.clientId))
        .take(BATCH_SIZE),
      ctx.db
        .query('agentEvents')
        .withIndex('by_client', (q) => q.eq('clientId', args.clientId))
        .take(BATCH_SIZE),
      ctx.db
        .query('agentCommits')
        .withIndex('by_client', (q) => q.eq('clientId', args.clientId))
        .take(BATCH_SIZE),
      ctx.db
        .query('checkTriggers')
        .withIndex('by_client', (q) => q.eq('clientId', args.clientId))
        .take(BATCH_SIZE),
      ctx.db
        .query('ledgerTotals')
        .withIndex('by_client', (q) => q.eq('clientId', args.clientId))
        .take(BATCH_SIZE),
      ctx.db
        .query('agentApiTokens')
        .withIndex('by_client', (q) => q.eq('clientId', args.clientId))
        .take(BATCH_SIZE),
      ctx.db
        .query('agentEndpoints')
        .withIndex('by_client', (q) => q.eq('clientId', args.clientId))
        .take(BATCH_SIZE),
    ])
    for (const project of projects) {
      if (project.ownerId === args.ownerId) {
        await ctx.db.patch(project._id, { status: 'deleted', updatedAt: Date.now() })
      }
    }
    for (const service of services) {
      if (service.ownerId !== args.ownerId) continue
      await ctx.db.patch(service._id, {
        active: false,
        status: 'deleted',
        updatedAt: Date.now(),
      })
      const credentials = await ctx.db
        .query('serviceCredentials')
        .withIndex('by_service', (q) => q.eq('serviceId', service._id))
        .unique()
      if (credentials) await ctx.db.delete(credentials._id)
    }
    for (const connection of [
      ...activeCodeConnections,
      ...deletedCodeConnections,
    ]) {
      if (connection.ownerId !== args.ownerId) continue
      const credentials = await ctx.db
        .query('codeConnectionCredentials')
        .withIndex('by_connection', (q) =>
          q.eq('connectionId', connection._id),
        )
        .unique()
      if (credentials) await ctx.db.delete(credentials._id)
      await ctx.db.delete(connection._id)
    }
    for (const snapshot of snapshots) {
      if (snapshot.ownerId === args.ownerId) await ctx.db.delete(snapshot._id)
    }
    for (const event of agentEvents) {
      if (event.ownerId === args.ownerId) await ctx.db.delete(event._id)
    }
    for (const commit of agentCommits) {
      if (commit.ownerId === args.ownerId) await ctx.db.delete(commit._id)
    }
    for (const trigger of checkTriggers) {
      if (trigger.ownerId === args.ownerId) await ctx.db.delete(trigger._id)
    }
    for (const totals of ledgerTotals) {
      if (totals.ownerId === args.ownerId) await ctx.db.delete(totals._id)
    }
    for (const token of agentTokens) {
      if (token.ownerId === args.ownerId) await ctx.db.delete(token._id)
    }
    for (const endpoint of agentEndpoints) {
      if (endpoint.ownerId === args.ownerId) await ctx.db.delete(endpoint._id)
    }
    if (
      projects.length === BATCH_SIZE ||
      services.length === BATCH_SIZE ||
      activeCodeConnections.length === BATCH_SIZE ||
      deletedCodeConnections.length === BATCH_SIZE ||
      snapshots.length === BATCH_SIZE ||
      agentEvents.length === BATCH_SIZE ||
      agentCommits.length === BATCH_SIZE ||
      checkTriggers.length === BATCH_SIZE ||
      ledgerTotals.length === BATCH_SIZE ||
      agentTokens.length === BATCH_SIZE ||
      agentEndpoints.length === BATCH_SIZE
    ) {
      await ctx.scheduler.runAfter(0, internal.cleanup.deletedClient, args)
    }
    return null
  },
})
