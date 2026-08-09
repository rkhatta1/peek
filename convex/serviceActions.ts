import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env } from './_generated/server'
import { requireOwner } from './lib/domain'
import { collectProvider, normalizeProviderCredentials, providerErrorCode } from './lib/providers'
import { encryptCredentials } from './lib/secrets'
import { providerCredentialsValidator } from './lib/validators'

export const connect = action({
  args: {
    projectId: v.id('projects'),
    serviceId: v.optional(v.id('serviceConnections')),
    name: v.string(),
    environment: v.string(),
    credentials: providerCredentialsValidator,
  },
  returns: v.id('serviceConnections'),
  handler: async (ctx, args): Promise<Id<'serviceConnections'>> => {
    const ownerId = await requireOwner(ctx)
    const context: {
      clientId: Id<'clients'>
      projectId: Id<'projects'>
      existing: null | {
        serviceId: Id<'serviceConnections'>
        provider: 'neon' | 'upstash'
        name: string
        environment: string
      }
    } = await ctx.runQuery(internal.serviceInternal.getConnectionContext, {
      ownerId,
      projectId: args.projectId,
      serviceId: args.serviceId,
    })
    let credentials
    try {
      credentials = normalizeProviderCredentials(args.credentials)
    } catch {
      throw new Error('INVALID_CONFIGURATION')
    }
    if (context.existing && context.existing.provider !== credentials.provider) {
      throw new Error('Service provider cannot be changed')
    }

    let snapshot
    try {
      snapshot = await collectProvider(credentials)
    } catch (error) {
      throw new Error(providerErrorCode(error))
    }

    const encryptedCredentials = await encryptCredentials(
      credentials,
      ownerId,
      env.PEEK_CREDENTIAL_ENCRYPTION_KEY,
    )
    return await ctx.runMutation(internal.serviceInternal.commitConnectedService, {
      ownerId,
      projectId: context.projectId,
      serviceId: args.serviceId,
      provider: credentials.provider,
      name: args.name,
      environment: args.environment,
      encryptedCredentials,
      snapshot,
    })
  },
})
