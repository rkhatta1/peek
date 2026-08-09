"use node"

import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env } from './_generated/server'
import { fetchGitHubMainCommitsPage } from './lib/codeAttribution'
import { requireOwner } from './lib/domain'
import {
  decryptCodeConnectionCredentials,
  type EncryptedCredentials,
} from './lib/secrets'

const PAGE_SIZE = 100
const MAX_PAGES_PER_SYNC = 100

type ResolutionTarget = {
  connectionId: Id<'codeConnections'>
  provider: 'github' | 'vercel'
  externalId: string
  externalSlug: string
  encryptedCredentials?: EncryptedCredentials
}

export const syncMain = action({
  args: { projectId: v.id('projects') },
  returns: v.object({ synced: v.number(), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const targets: ResolutionTarget[] = await ctx.runQuery(
      internal.codeConnectionInternal.listResolutionTargets,
      { ownerId, projectId: args.projectId },
    )
    const target = targets.find((candidate) => candidate.provider === 'github')
    if (!target?.encryptedCredentials) throw new Error('GITHUB_NOT_CONNECTED')
    const credentials = await decryptCodeConnectionCredentials(
      target.encryptedCredentials,
      ownerId,
      encryptionKeys(),
    )
    if (credentials.provider !== 'github') {
      throw new Error('CREDENTIAL_PROVIDER_MISMATCH')
    }
    let synced = 0
    for (let page = 1; page <= MAX_PAGES_PER_SYNC; page += 1) {
      const commits = await fetchGitHubMainCommitsPage({
        repository: target.externalSlug,
        token: credentials.token,
        page,
        perPage: PAGE_SIZE,
      })
      if (commits.length) {
        const knownShas: string[] = await ctx.runQuery(
          internal.agentCommitInternal.knownShas,
          {
            connectionId: target.connectionId,
            shas: commits.map((commit) => commit.sha),
          },
        )
        const known = new Set(knownShas)
        const unseen = commits.filter(
          (commit) => !known.has(commit.sha.toLowerCase()),
        )
        if (unseen.length) {
          await ctx.runMutation(internal.agentCommitInternal.upsertPage, {
            ownerId,
            projectId: args.projectId,
            connectionId: target.connectionId,
            commits: unseen,
          })
          synced += unseen.length
        }
        if (known.size) return { synced, truncated: false }
      }
      if (commits.length < PAGE_SIZE) return { synced, truncated: false }
    }
    return { synced, truncated: true }
  },
})

function encryptionKeys() {
  return [
    env.PEEK_CREDENTIAL_ENCRYPTION_KEY,
    env.PEEK_CREDENTIAL_PREVIOUS_ENCRYPTION_KEY,
  ].filter((key): key is string => Boolean(key))
}
