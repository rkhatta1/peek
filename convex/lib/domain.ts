import type { ActionCtx, MutationCtx, QueryCtx } from '../_generated/server'
import type { Id } from '../_generated/dataModel'

type AuthenticatedCtx = Pick<ActionCtx | MutationCtx | QueryCtx, 'auth'>

export async function requireOwner(ctx: AuthenticatedCtx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error('Unauthenticated')
  return identity.tokenIdentifier
}

type DatabaseCtx = Pick<MutationCtx | QueryCtx, 'db'>

export async function activeProjectForOwner(
  ctx: DatabaseCtx,
  ownerId: string,
  projectId: Id<'projects'>,
) {
  const project = await ctx.db.get(projectId)
  if (!project || project.ownerId !== ownerId || project.status !== 'active') {
    return null
  }
  const client = await ctx.db.get(project.clientId)
  if (!client || client.ownerId !== ownerId || client.status !== 'active') {
    return null
  }
  return project
}

export async function requireActiveProjectForOwner(
  ctx: DatabaseCtx,
  ownerId: string,
  projectId: Id<'projects'>,
) {
  const project = await activeProjectForOwner(ctx, ownerId, projectId)
  if (!project) throw new Error('Project not found')
  return project
}

export function normalizeName(value: string, label: string) {
  const name = value.trim().replace(/\s+/g, ' ')
  if (!name) throw new Error(`${label} name is required`)
  if (name.length > 80) throw new Error(`${label} name must be 80 characters or fewer`)
  return { name, normalizedName: name.toLocaleLowerCase('en-US') }
}

export function normalizeEnvironment(value: string) {
  const environment = value.trim().replace(/\s+/g, ' ')
  if (!environment) throw new Error('Environment is required')
  if (environment.length > 40) {
    throw new Error('Environment must be 40 characters or fewer')
  }
  return environment
}
