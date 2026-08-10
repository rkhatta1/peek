import { v } from 'convex/values'

import { internal } from './_generated/api'
import type { Doc, Id } from './_generated/dataModel'
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from './_generated/server'
import { requireActiveProjectForOwner } from './lib/domain'
import {
  codeProviderValidator,
  encryptedCredentialsValidator,
} from './lib/validators'

const ACTIVE = 'active' as const
const COMMIT_SYNC_LEASE_MS = 60_000

const internalConnectionValidator = v.object({
  connectionId: v.id('codeConnections'),
  provider: codeProviderValidator,
  externalId: v.string(),
  externalSlug: v.string(),
  branch: v.string(),
  lastSyncedHeadSha: v.optional(v.string()),
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
          branch: connection.branch,
          lastSyncedHeadSha: connection.lastSyncedHeadSha,
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

export const claimCommitSync = internalMutation({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    connectionId: v.id('codeConnections'),
    runId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await requireActiveProjectForOwner(ctx, args.ownerId, args.projectId)
    const connection = await ctx.db.get(args.connectionId)
    if (!isActiveGitHubConnection(connection, args)) {
      throw new Error('GitHub connection not found')
    }
    requireRunId(args.runId)
    const now = Date.now()
    if (
      connection.commitSyncLease &&
      connection.commitSyncLease.runId !== args.runId &&
      connection.commitSyncLease.expiresAt > now
    ) {
      throw new Error('COMMIT_SYNC_IN_PROGRESS')
    }
    if (
      connection.commitSyncLease?.runId !== args.runId &&
      connection.lastCommitSyncStartedAt !== undefined &&
      now - connection.lastCommitSyncStartedAt < COMMIT_SYNC_LEASE_MS
    ) {
      throw new Error('COMMIT_SYNC_COOLDOWN')
    }
    await ctx.db.patch(connection._id, {
      lastCommitSyncStartedAt: now,
      commitSyncLease: { runId: args.runId, expiresAt: now + COMMIT_SYNC_LEASE_MS },
      updatedAt: now,
    })
    return null
  },
})

export const heartbeatCommitSync = internalMutation({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    connectionId: v.id('codeConnections'),
    runId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId)
    if (
      !isActiveGitHubConnection(connection, args) ||
      connection.commitSyncLease?.runId !== args.runId
    ) {
      return false
    }
    const now = Date.now()
    await ctx.db.patch(connection._id, {
      commitSyncLease: { runId: args.runId, expiresAt: now + COMMIT_SYNC_LEASE_MS },
      updatedAt: now,
    })
    return true
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
    branch: v.optional(v.string()),
    encryptedCredentials: encryptedCredentialsValidator,
    replace: v.optional(v.boolean()),
    commitSyncRunId: v.optional(v.string()),
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
    if (
      args.commitSyncRunId !== undefined &&
      existing?.commitSyncLease?.runId !== args.commitSyncRunId
    ) {
      throw new Error('COMMIT_SYNC_STALE')
    }
    const now = Date.now()
    const branch = normalizeBranch(args.branch ?? 'main')
    let connectionId: Id<'codeConnections'>
    const repositoryChanged =
      existing?.provider === 'github' &&
      existing.externalId !== args.externalId
    const branchChanged =
      existing?.provider === 'github' &&
      !repositoryChanged &&
      args.replace !== true &&
      existing.branch !== branch
    const replacementRequired = repositoryChanged || args.replace === true
    if (existing && branchChanged) {
      const legacyCount = existing.agentCommitCount ??
        (await ctx.db
          .query('ledgerTotals')
          .withIndex('by_project', (q) => q.eq('projectId', project._id))
          .unique())?.agentCommits ??
        0
      await ctx.db.patch(existing._id, {
        status: 'inactive',
        agentCommitCount: legacyCount,
        commitSyncLease: undefined,
        updatedAt: now,
      })
      const archived = await ctx.db
        .query('codeConnections')
        .withIndex(
          'by_project_and_provider_and_externalId_and_branch_and_status',
          (q) =>
            q
              .eq('projectId', project._id)
              .eq('provider', 'github')
              .eq('externalId', args.externalId)
              .eq('branch', branch)
              .eq('status', 'inactive'),
        )
        .order('desc')
        .first()
      if (archived) {
        await ctx.db.patch(archived._id, {
          externalSlug: args.externalSlug,
          name: args.name,
          status: ACTIVE,
          branchSelectedAt: now,
          commitSyncLease: undefined,
          lastCommitSyncStartedAt: undefined,
          lastValidatedAt: now,
          updatedAt: now,
        })
        connectionId = archived._id
      } else {
        connectionId = await ctx.db.insert('codeConnections', {
          clientId: project.clientId,
          projectId: project._id,
          ownerId: args.ownerId,
          provider: 'github',
          externalId: args.externalId,
          externalSlug: args.externalSlug,
          name: args.name,
          branch,
          environment: 'production',
          status: ACTIVE,
          branchSelectedAt: now,
          agentCommitCount: 0,
          lastValidatedAt: now,
          createdAt: now,
          updatedAt: now,
        })
      }
      await clearActiveCommit(ctx, project._id, args.ownerId, now)
    } else if (existing && !replacementRequired) {
      await ctx.db.patch(existing._id, {
        externalId: args.externalId,
        externalSlug: args.externalSlug,
        name: args.name,
        branch,
        lastValidatedAt: now,
        updatedAt: now,
      })
      connectionId = existing._id
    } else {
      if (existing) {
        await ctx.db.patch(existing._id, { status: 'deleted', updatedAt: now })
        const credentials = await ctx.db
          .query('codeConnectionCredentials')
          .withIndex('by_connection', (q) =>
            q.eq('connectionId', existing._id),
          )
          .unique()
        if (credentials) await ctx.db.delete(credentials._id)
      }
      connectionId = await ctx.db.insert('codeConnections', {
        clientId: project.clientId,
        projectId: project._id,
        ownerId: args.ownerId,
        provider: args.provider,
        externalId: args.externalId,
        externalSlug: args.externalSlug,
        name: args.name,
        branch,
        environment: 'production',
        status: ACTIVE,
        ...(args.provider === 'github' ? { agentCommitCount: 0 } : {}),
        lastValidatedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      if (replacementRequired) {
        await clearActiveCommit(ctx, project._id, args.ownerId, now)
        await ctx.scheduler.runAfter(
          0,
          internal.cleanup.deletedCodeConnection,
          { ownerId: args.ownerId, connectionId: existing!._id },
        )
      }
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

function isActiveGitHubConnection(
  connection: Doc<'codeConnections'> | null,
  args: {
    ownerId: string
    projectId: Id<'projects'>
    connectionId: Id<'codeConnections'>
  },
): connection is Doc<'codeConnections'> {
  return (
    connection !== null &&
    connection._id === args.connectionId &&
    connection.ownerId === args.ownerId &&
    connection.projectId === args.projectId &&
    connection.provider === 'github' &&
    connection.status === ACTIVE
  )
}

function requireRunId(runId: string) {
  if (!runId || runId.length > 100) throw new Error('INVALID_COMMIT_SYNC_RUN')
}

function normalizeBranch(value: string) {
  const branch = value.trim()
  if (!branch || branch.length > 255 || /[\r\n]/.test(branch)) {
    throw new Error('INVALID_GITHUB_BRANCH')
  }
  return branch
}

async function clearActiveCommit(
  ctx: MutationCtx,
  projectId: Id<'projects'>,
  ownerId: string,
  now: number,
) {
  const endpoint = await ctx.db
    .query('agentEndpoints')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .unique()
  if (endpoint?.ownerId === ownerId) {
    await ctx.db.patch(endpoint._id, {
      activeCommitId: undefined,
      updatedAt: now,
    })
  }
}
