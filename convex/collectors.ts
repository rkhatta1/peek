import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env, internalAction, type ActionCtx } from './_generated/server'
import { requireOwner } from './lib/domain'
import { collectProvider, providerErrorCode, unavailableSnapshot } from './lib/providers'
import { decryptCredentials, type EncryptedCredentials } from './lib/secrets'
import { providerValidator } from './lib/validators'

type CollectionTarget = {
  serviceId: Id<'serviceConnections'>
  clientId: Id<'clients'>
  projectId: Id<'projects'>
  ownerId: string
  provider: 'neon' | 'upstash'
  encryptedCredentials: EncryptedCredentials
}

const collectionResultValidator = v.object({
  serviceId: v.id('serviceConnections'),
  provider: providerValidator,
  stored: v.boolean(),
})

function encryptionKeys() {
  return [
    env.PEEK_CREDENTIAL_ENCRYPTION_KEY,
    env.PEEK_CREDENTIAL_PREVIOUS_ENCRYPTION_KEY,
  ].filter((key): key is string => Boolean(key))
}

async function collectTarget(ctx: ActionCtx, target: CollectionTarget) {
  try {
    const credentials = await decryptCredentials(
      target.encryptedCredentials,
      target.ownerId,
      encryptionKeys(),
    )
    if (credentials.provider !== target.provider) throw new Error('CREDENTIAL_PROVIDER_MISMATCH')
    const snapshot = await collectProvider(credentials)
    await ctx.runMutation(internal.serviceInternal.markCollection, {
      serviceId: target.serviceId,
      snapshot,
    })
  } catch (error) {
    const errorCode =
      error instanceof Error && error.message.startsWith('CREDENTIAL_')
        ? error.message
        : providerErrorCode(error)
    await ctx.runMutation(internal.serviceInternal.markCollection, {
      serviceId: target.serviceId,
      snapshot: unavailableSnapshot(target.provider),
      errorCode,
    })
  }
  return { serviceId: target.serviceId, provider: target.provider, stored: true }
}

async function collectInBatches(ctx: ActionCtx, targets: CollectionTarget[]) {
  const results: Array<{
    serviceId: Id<'serviceConnections'>
    provider: 'neon' | 'upstash'
    stored: boolean
  }> = []
  for (let index = 0; index < targets.length; index += 5) {
    results.push(...(await Promise.all(targets.slice(index, index + 5).map((target) => collectTarget(ctx, target)))))
  }
  return results
}

export const refreshNow = action({
  args: { projectId: v.id('projects') },
  returns: v.array(collectionResultValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const targets: CollectionTarget[] = await ctx.runQuery(
      internal.serviceInternal.listCollectionTargetsForProject,
      { ownerId, projectId: args.projectId },
    )
    return await collectInBatches(ctx, targets)
  },
})

export const collectScheduledPage = internalAction({
  args: { cursor: v.union(v.null(), v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const page: {
      page: CollectionTarget[]
      isDone: boolean
      continueCursor: string
    } = await ctx.runQuery(internal.serviceInternal.listCollectionTargetsPage, {
      paginationOpts: { cursor: args.cursor, numItems: 25 },
    })
    await collectInBatches(ctx, page.page)
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.collectors.collectScheduledPage, {
        cursor: page.continueCursor,
      })
    }
    return null
  },
})
