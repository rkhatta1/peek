import {
  paginationOptsValidator,
  paginationResultValidator,
} from 'convex/server'
import { v } from 'convex/values'

import { mutation, query } from './_generated/server'
import { requireActiveProjectForOwner, requireOwner } from './lib/domain'
import { enforceLedgerPageSize } from './lib/pagination'

const commitValidator = v.object({
  _id: v.id('agentCommits'),
  _creationTime: v.number(),
  clientId: v.id('clients'),
  projectId: v.id('projects'),
  connectionId: v.id('codeConnections'),
  sha: v.string(),
  title: v.string(),
  author: v.string(),
  committedAt: v.number(),
  url: v.string(),
  comment: v.optional(v.string()),
  commentUpdatedAt: v.optional(v.number()),
  syncedAt: v.number(),
})

export const list = query({
  args: {
    projectId: v.id('projects'),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(commitValidator),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    await requireActiveProjectForOwner(ctx, ownerId, args.projectId)
    enforceLedgerPageSize(args.paginationOpts.numItems)
    const connection = await ctx.db
      .query('codeConnections')
      .withIndex('by_project_and_provider_and_status', (q) =>
        q
          .eq('projectId', args.projectId)
          .eq('provider', 'github')
          .eq('status', 'active'),
      )
      .unique()
    if (!connection || connection.ownerId !== ownerId) {
      return { page: [], continueCursor: '', isDone: true }
    }
    const result = await ctx.db
      .query('agentCommits')
      .withIndex('by_connection_and_committedAt', (q) =>
        q.eq('connectionId', connection._id),
      )
      .order('desc')
      .paginate(args.paginationOpts)
    return {
      ...result,
      page: result.page.map(({ ownerId: _ownerId, ...commit }) => commit),
    }
  },
})

export const setComment = mutation({
  args: { commitId: v.id('agentCommits'), comment: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const commit = await ctx.db.get(args.commitId)
    if (!commit || commit.ownerId !== ownerId) throw new Error('Commit not found')
    const project = await requireActiveProjectForOwner(
      ctx,
      ownerId,
      commit.projectId,
    )
    const connection = await ctx.db
      .query('codeConnections')
      .withIndex('by_project_and_provider_and_status', (q) =>
        q
          .eq('projectId', project._id)
          .eq('provider', 'github')
          .eq('status', 'active'),
      )
      .unique()
    if (!connection || connection._id !== commit.connectionId) {
      throw new Error('Commit not found')
    }
    const comment = args.comment.trim()
    if (comment.length > 2_000) throw new Error('Comment is too long')
    const now = Date.now()
    await ctx.db.patch(commit._id, {
      comment: comment || undefined,
      commentUpdatedAt: comment ? now : undefined,
    })
    const endpoint = await ctx.db
      .query('agentEndpoints')
      .withIndex('by_project', (q) => q.eq('projectId', project._id))
      .unique()
    if (endpoint) {
      if (endpoint.ownerId !== ownerId) throw new Error('Agent endpoint not found')
      await ctx.db.patch(endpoint._id, {
        comment: '',
        activeCommitId: comment
          ? commit._id
          : endpoint.activeCommitId === commit._id
            ? undefined
            : endpoint.activeCommitId,
        updatedAt: now,
      })
    } else if (comment) {
      await ctx.db.insert('agentEndpoints', {
        clientId: project.clientId,
        projectId: project._id,
        ownerId,
        comment: '',
        activeCommitId: commit._id,
        createdAt: now,
        updatedAt: now,
      })
    }
    return null
  },
})
