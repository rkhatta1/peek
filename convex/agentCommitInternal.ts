import { v } from 'convex/values'

import { internalMutation, internalQuery } from './_generated/server'
import { requireActiveProjectForOwner } from './lib/domain'
import { incrementLedgerTotals } from './lib/ledgerTotals'

const commitValidator = v.object({
  sha: v.string(),
  title: v.string(),
  author: v.string(),
  committedAt: v.number(),
  url: v.string(),
})

export const knownShas = internalQuery({
  args: {
    connectionId: v.id('codeConnections'),
    shas: v.array(v.string()),
  },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    if (args.shas.length > 100) throw new Error('Commit page is too large')
    const matches = await Promise.all(
      args.shas.map(async (sha) =>
        await ctx.db
          .query('agentCommits')
          .withIndex('by_connection_and_sha', (q) =>
            q.eq('connectionId', args.connectionId).eq('sha', sha.toLowerCase()),
          )
          .unique(),
      ),
    )
    return matches.flatMap((commit) => (commit ? [commit.sha] : []))
  },
})

export const upsertPage = internalMutation({
  args: {
    ownerId: v.string(),
    projectId: v.id('projects'),
    connectionId: v.id('codeConnections'),
    commits: v.array(commitValidator),
  },
  returns: v.object({ inserted: v.number(), updated: v.number() }),
  handler: async (ctx, args) => {
    const project = await requireActiveProjectForOwner(
      ctx,
      args.ownerId,
      args.projectId,
    )
    const connection = await ctx.db.get(args.connectionId)
    if (
      !connection ||
      connection.ownerId !== args.ownerId ||
      connection.projectId !== project._id ||
      connection.provider !== 'github' ||
      connection.status !== 'active'
    ) {
      throw new Error('GitHub connection not found')
    }
    if (args.commits.length > 100) throw new Error('Commit page is too large')
    let inserted = 0
    let updated = 0
    const syncedAt = Date.now()
    for (const commit of args.commits) {
      if (
        !/^[a-f0-9]{40}$/i.test(commit.sha) ||
        !commit.title.trim() ||
        commit.title.length > 500 ||
        !commit.author.trim() ||
        commit.author.length > 200 ||
        !Number.isFinite(commit.committedAt) ||
        commit.committedAt < 0 ||
        !commit.url.startsWith('https://github.com/')
      ) {
        throw new Error('Invalid GitHub commit')
      }
      const existing = await ctx.db
        .query('agentCommits')
        .withIndex('by_connection_and_sha', (q) =>
          q.eq('connectionId', connection._id).eq('sha', commit.sha),
        )
        .unique()
      const fields = {
        title: commit.title.trim(),
        author: commit.author.trim(),
        committedAt: commit.committedAt,
        url: commit.url,
        syncedAt,
      }
      if (existing) {
        await ctx.db.patch(existing._id, fields)
        updated += 1
      } else {
        await ctx.db.insert('agentCommits', {
          clientId: project.clientId,
          projectId: project._id,
          ownerId: args.ownerId,
          connectionId: connection._id,
          sha: commit.sha.toLowerCase(),
          ...fields,
        })
        inserted += 1
      }
    }
    if (inserted) {
      await incrementLedgerTotals(
        ctx,
        {
          clientId: project.clientId,
          projectId: project._id,
          ownerId: args.ownerId,
        },
        { agentCommits: inserted },
      )
    }
    return { inserted, updated }
  },
})
