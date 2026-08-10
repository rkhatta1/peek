"use node"

import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env, type ActionCtx } from './_generated/server'
import {
  fetchGitHubMainCommitsPage,
  isGitHubCommitAncestor,
} from './lib/codeAttribution'
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
  lastSyncedHeadSha?: string
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
    const runId = crypto.randomUUID()
    await ctx.runMutation(internal.codeConnectionInternal.claimCommitSync, {
      ownerId,
      projectId: args.projectId,
      connectionId: target.connectionId,
      runId,
    })
    const credentials = await decryptCodeConnectionCredentials(
      target.encryptedCredentials,
      ownerId,
      encryptionKeys(),
    )
    if (credentials.provider !== 'github') {
      throw new Error('CREDENTIAL_PROVIDER_MISMATCH')
    }
    const firstPage = await fetchGitHubMainCommitsPage({
      repository: target.externalSlug,
      token: credentials.token,
      page: 1,
      perPage: PAGE_SIZE,
    })
    const headSha = firstPage[0]?.sha.toLowerCase()
    if (!headSha) {
      await finishSync(ctx, ownerId, target.connectionId, runId)
      return { synced: 0, truncated: false }
    }
    let connectionId = target.connectionId
    if (
      target.lastSyncedHeadSha &&
      target.lastSyncedHeadSha !== headSha
    ) {
      const remainsAncestor = await isGitHubCommitAncestor({
        repository: target.externalSlug,
        base: target.lastSyncedHeadSha,
        head: headSha,
        token: credentials.token,
      })
      if (!remainsAncestor) {
        await heartbeatSync(
          ctx,
          ownerId,
          args.projectId,
          connectionId,
          runId,
        )
        connectionId = await ctx.runMutation(
          internal.codeConnectionInternal.commitValidatedConnection,
          {
            ownerId,
            projectId: args.projectId,
            provider: 'github',
            externalId: target.externalId,
            externalSlug: target.externalSlug,
            name: target.externalSlug,
            encryptedCredentials: target.encryptedCredentials,
            replace: true,
            commitSyncRunId: runId,
          },
        )
        await ctx.runMutation(
          internal.codeConnectionInternal.claimCommitSync,
          { ownerId, projectId: args.projectId, connectionId, runId },
        )
      }
    }
    let synced = 0
    for (let page = 1; page <= MAX_PAGES_PER_SYNC; page += 1) {
      const commits =
        page === 1
          ? firstPage
          : await fetchGitHubMainCommitsPage({
              repository: target.externalSlug,
              token: credentials.token,
              page,
              perPage: PAGE_SIZE,
            })
      await heartbeatSync(ctx, ownerId, args.projectId, connectionId, runId)
      if (commits.length) {
        const knownShas: string[] = await ctx.runQuery(
          internal.agentCommitInternal.knownShas,
          {
            connectionId,
            shas: commits.map((commit) => commit.sha),
          },
        )
        const known = new Set(knownShas)
        const unseen = commits.filter(
          (commit) => !known.has(commit.sha.toLowerCase()),
        )
        if (unseen.length) {
          const result = await ctx.runMutation(
            internal.agentCommitInternal.upsertPage,
            {
              ownerId,
              projectId: args.projectId,
              connectionId,
              runId,
              commits: unseen,
            },
          )
          synced += result.inserted
        }
        if (known.size) {
          await finishSync(ctx, ownerId, connectionId, runId, headSha)
          return { synced, truncated: false }
        }
      }
      if (commits.length < PAGE_SIZE) {
        await finishSync(ctx, ownerId, connectionId, runId, headSha)
        return { synced, truncated: false }
      }
    }
    await finishSync(ctx, ownerId, connectionId, runId, headSha)
    return { synced, truncated: true }
  },
})

async function finishSync(
  ctx: ActionCtx,
  ownerId: string,
  connectionId: Id<'codeConnections'>,
  runId: string,
  headSha?: string,
) {
  const finished: boolean = await ctx.runMutation(
    internal.agentCommitInternal.finishSync,
    {
      ownerId,
      connectionId,
      runId,
      headSha,
    },
  )
  if (!finished) throw new Error('COMMIT_SYNC_STALE')
}

async function heartbeatSync(
  ctx: ActionCtx,
  ownerId: string,
  projectId: Id<'projects'>,
  connectionId: Id<'codeConnections'>,
  runId: string,
) {
  const active: boolean = await ctx.runMutation(
    internal.codeConnectionInternal.heartbeatCommitSync,
    {
      ownerId,
      projectId,
      connectionId,
      runId,
    },
  )
  if (!active) throw new Error('COMMIT_SYNC_STALE')
}

function encryptionKeys() {
  return [
    env.PEEK_CREDENTIAL_ENCRYPTION_KEY,
    env.PEEK_CREDENTIAL_PREVIOUS_ENCRYPTION_KEY,
  ].filter((key): key is string => Boolean(key))
}
