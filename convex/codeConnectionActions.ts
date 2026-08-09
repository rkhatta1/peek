"use node"

import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Id } from './_generated/dataModel'
import { action, env } from './_generated/server'
import {
  fetchGitHubAttributionAt,
  fetchVercelAttributionAt,
  validateGitHubRepository,
  validateVercelProject,
} from './lib/codeAttribution'
import { requireOwner } from './lib/domain'
import {
  decryptCodeConnectionCredentials,
  encryptCodeConnectionCredentials,
  type EncryptedCredentials,
} from './lib/secrets'

type ResolutionTarget = {
  connectionId: Id<'codeConnections'>
  provider: 'github' | 'vercel'
  externalId: string
  externalSlug: string
  encryptedCredentials?: EncryptedCredentials
}

const githubPullRequestValidator = v.object({
  number: v.number(),
  title: v.string(),
  mergedAt: v.union(v.null(), v.number()),
  url: v.string(),
})

const githubAttributionValidator = v.object({
  repository: v.string(),
  branch: v.literal('main'),
  sha: v.string(),
  committedAt: v.number(),
  message: v.string(),
  authorLogin: v.union(v.null(), v.string()),
  url: v.string(),
  pullRequests: v.array(githubPullRequestValidator),
})

const vercelAttributionValidator = v.object({
  projectId: v.string(),
  deploymentId: v.string(),
  name: v.string(),
  url: v.string(),
  createdAt: v.number(),
  readyAt: v.number(),
  commitSha: v.union(v.null(), v.string()),
  branch: v.union(v.null(), v.string()),
})

const attributionResultValidator = v.object({
  observedAt: v.number(),
  github: v.union(
    v.null(),
    v.object({
      connectionId: v.id('codeConnections'),
      data: v.union(v.null(), githubAttributionValidator),
      errorCode: v.union(v.null(), v.string()),
    }),
  ),
  vercel: v.union(
    v.null(),
    v.object({
      connectionId: v.id('codeConnections'),
      data: v.union(v.null(), vercelAttributionValidator),
      errorCode: v.union(v.null(), v.string()),
    }),
  ),
})

export const connect = action({
  args: {
    projectId: v.id('projects'),
    configuration: v.union(
      v.object({
        provider: v.literal('github'),
        repository: v.string(),
        token: v.string(),
      }),
      v.object({
        provider: v.literal('vercel'),
        projectId: v.string(),
        token: v.string(),
      }),
    ),
  },
  returns: v.id('codeConnections'),
  handler: async (ctx, args): Promise<Id<'codeConnections'>> => {
    const ownerId = await requireOwner(ctx)
    await ctx.runQuery(internal.codeConnectionInternal.getProjectContext, {
      ownerId,
      projectId: args.projectId,
    })

    let validated
    const token = normalizeToken(args.configuration.token)
    try {
      if (args.configuration.provider === 'github') {
        validated = await validateGitHubRepository({
          repository: args.configuration.repository,
          token,
        })
      } else {
        validated = await validateVercelProject({
          projectId: args.configuration.projectId,
          token,
        })
      }
    } catch (error) {
      throw new Error(codeConnectionErrorCode(error))
    }

    const encryptedCredentials = await encryptCodeConnectionCredentials(
      { provider: args.configuration.provider, token },
      ownerId,
      env.PEEK_CREDENTIAL_ENCRYPTION_KEY,
    )

    return await ctx.runMutation(
      internal.codeConnectionInternal.commitValidatedConnection,
      {
        ownerId,
        projectId: args.projectId,
        provider: args.configuration.provider,
        encryptedCredentials,
        ...validated,
      },
    )
  },
})

export const resolveAttribution = action({
  args: { projectId: v.id('projects'), observedAt: v.number() },
  returns: attributionResultValidator,
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    if (!Number.isFinite(args.observedAt) || args.observedAt <= 0) {
      throw new Error('INVALID_OBSERVATION_TIME')
    }
    const targets: ResolutionTarget[] = await ctx.runQuery(
      internal.codeConnectionInternal.listResolutionTargets,
      { ownerId, projectId: args.projectId },
    )
    const githubTarget = targets.find((target) => target.provider === 'github')
    const vercelTarget = targets.find((target) => target.provider === 'vercel')
    const [github, vercel] = await Promise.all([
      githubTarget
        ? resolveGitHub(githubTarget, args.observedAt, ownerId)
        : null,
      vercelTarget
        ? resolveVercel(vercelTarget, args.observedAt, ownerId)
        : null,
    ])
    return { observedAt: args.observedAt, github, vercel }
  },
})

async function resolveGitHub(
  target: ResolutionTarget,
  observedAt: number,
  ownerId: string,
) {
  try {
    if (!target.encryptedCredentials) {
      throw new Error('CREDENTIAL_NOT_CONFIGURED')
    }
    const credentials = await decryptCodeConnectionCredentials(
      target.encryptedCredentials,
      ownerId,
      encryptionKeys(),
    )
    if (credentials.provider !== 'github') {
      throw new Error('CREDENTIAL_PROVIDER_MISMATCH')
    }
    const data = await fetchGitHubAttributionAt({
      repository: target.externalSlug,
      observedAt,
      token: credentials.token,
    })
    return { connectionId: target.connectionId, data, errorCode: null }
  } catch (error) {
    return {
      connectionId: target.connectionId,
      data: null,
      errorCode: codeConnectionErrorCode(error),
    }
  }
}

async function resolveVercel(
  target: ResolutionTarget,
  observedAt: number,
  ownerId: string,
) {
  try {
    if (!target.encryptedCredentials) {
      throw new Error('CREDENTIAL_NOT_CONFIGURED')
    }
    const credentials = await decryptCodeConnectionCredentials(
      target.encryptedCredentials,
      ownerId,
      encryptionKeys(),
    )
    if (credentials.provider !== 'vercel') {
      throw new Error('CREDENTIAL_PROVIDER_MISMATCH')
    }
    const data = await fetchVercelAttributionAt({
      projectId: target.externalId,
      observedAt,
      token: credentials.token,
    })
    return { connectionId: target.connectionId, data, errorCode: null }
  } catch (error) {
    return {
      connectionId: target.connectionId,
      data: null,
      errorCode: codeConnectionErrorCode(error),
    }
  }
}

function encryptionKeys() {
  return [
    env.PEEK_CREDENTIAL_ENCRYPTION_KEY,
    env.PEEK_CREDENTIAL_PREVIOUS_ENCRYPTION_KEY,
  ].filter((key): key is string => Boolean(key))
}

function normalizeToken(value: string) {
  const token = value.trim()
  if (!token || token.length > 4096) throw new Error('INVALID_CONFIGURATION')
  return token
}

function codeConnectionErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.startsWith('CREDENTIAL_')) return message
  if (message.includes('INVALID_')) return 'INVALID_CONFIGURATION'
  if (/_HTTP_(401|403)$/.test(message)) return 'CREDENTIAL_REJECTED'
  if (message.endsWith('_HTTP_404')) return 'RESOURCE_NOT_FOUND'
  if (message.startsWith('GITHUB_')) return 'GITHUB_UNAVAILABLE'
  if (message.startsWith('VERCEL_')) return 'VERCEL_UNAVAILABLE'
  return 'ATTRIBUTION_UNAVAILABLE'
}
