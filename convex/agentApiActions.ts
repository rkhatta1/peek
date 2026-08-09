import { v } from 'convex/values'

import { internal } from './_generated/api'
import { action } from './_generated/server'
import { createAgentToken, hashAgentToken } from './lib/agentApi'
import { requireOwner } from './lib/domain'

export const rotateToken = action({
  args: { projectId: v.id('projects') },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    const ownerId = await requireOwner(ctx)
    const { token, tokenId } = createAgentToken()
    await ctx.runMutation(internal.agentApiInternal.rotateToken, {
      ownerId,
      projectId: args.projectId,
      tokenId,
      tokenHash: await hashAgentToken(token),
      hint: token.slice(-6),
    })
    return { token }
  },
})
