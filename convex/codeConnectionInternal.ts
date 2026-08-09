import { v } from 'convex/values'

import type { Id } from './_generated/dataModel'
import { internalMutation, internalQuery } from './_generated/server'
import { requireActiveProjectForOwner } from './lib/domain'
import {
  codeProviderValidator,
  encryptedCredentialsValidator,
} from './lib/validators'

const ACTIVE = 'active' as const

const internalConnectionValidator = v.object({
  connectionId: v.id('codeConnections'),
  provider: codeProviderValidator,
  externalId: v.string(),
  externalSlug: v.string(),
  encryptedCredentials: v.optional(encryptedCredentialsValidator),
})

export const getProjectContext = internalQuery({
  args: { ownerId: v.string(), projectId: v.id('projects') },
  returns: v.object({
    clientId: v.id('clients'),
    projectId: v.id('projects'),
  }),
  handler: async (ctx, args) => {
    const project = await requireActiveProjectForOwner(
      ctx,
      args.ownerId,
      args.projectId,
    )
    return { clientId: project.clientId, projectId: project._id }
  },
})

export const listResolutionTargets = internalQuery({
  args: { ownerId: v.string(), projectId: v.id('projects') },
  returns: v.array(internalConnectionValidator),
  handler: async (ctx, args) => {
    await requireActiveProjectForOwner(ctx, args.ownerId, args.projectId)
    const connections = await ctx.db
      .query('codeConnections')
      .withIndex('by_project_and_status', (q) =>
        q.eq('projectId', args.projectId).eq('status', ACTIVE),
      )
      .take(2)
    return await Promise.all(
      connections.map(async (connection) => {
        const credentials = await ctx.db
          .query('codeConnectionCredentials')
          .withIndex('by_connection', (q) =>
            q.eq('connectionId', connection._id),
          )
          .unique()
        return {
          connectionId: connection._id,
          provider: connection.provider,
          externalId: connection.externalId,
          externalSlug: connection.externalSlug,
          encryptedCredentials: credentials
            ? {
                algorithm: credentials.algorithm,
                binding: credentials.binding,
                ciphertext: credentials.ciphertext,
                iv: credentials.iv,
                keyId: credentials.keyId,
              }
            : undefined,
        }
      }),
    )
  },
})

export const commitValidatedConnection = internalMutation({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    provider: codeProviderValidator,
    externalId: v.string(),
    externalSlug: v.string(),
    name: v.string(),
    encryptedCredentials: encryptedCredentialsValidator,
  },
  returns: v.id('codeConnections'),
  handler: async (ctx, args) => {
    const project = await requireActiveProjectForOwner(
      ctx,
      args.ownerId,
      args.projectId,
    )
    const existing = await ctx.db
      .query('codeConnections')
      .withIndex('by_project_and_provider_and_status', (q) =>
        q
          .eq('projectId', project._id)
          .eq('provider', args.provider)
          .eq('status', ACTIVE),
      )
      .unique()
    const now = Date.now()
    let connectionId: Id<'codeConnections'>
    if (existing) {
      await ctx.db.patch(existing._id, {
        externalId: args.externalId,
        externalSlug: args.externalSlug,
        name: args.name,
        lastValidatedAt: now,
        updatedAt: now,
      })
      connectionId = existing._id
    } else {
      connectionId = await ctx.db.insert('codeConnections', {
        clientId: project.clientId,
        projectId: project._id,
        ownerId: args.ownerId,
        provider: args.provider,
        externalId: args.externalId,
        externalSlug: args.externalSlug,
        name: args.name,
        branch: 'main',
        environment: 'production',
        status: ACTIVE,
        lastValidatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }

    const existingCredentials = await ctx.db
      .query('codeConnectionCredentials')
      .withIndex('by_connection', (q) => q.eq('connectionId', connectionId))
      .unique()
    const credentialRecord = {
      connectionId,
      ownerId: args.ownerId,
      ...args.encryptedCredentials,
      createdAt: existingCredentials?.createdAt ?? now,
      updatedAt: now,
    }
    if (existingCredentials) {
      await ctx.db.replace(existingCredentials._id, credentialRecord)
    } else {
      await ctx.db.insert('codeConnectionCredentials', credentialRecord)
    }
    return connectionId
  },
})
