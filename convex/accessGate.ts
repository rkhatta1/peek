import { v } from 'convex/values'

import { action, internalMutation, mutation } from './_generated/server'
import {
  createAccessToken,
  hashAccessCode,
  timingSafeEqualString,
  verifyAccessToken,
} from './lib/accessGateCrypto'

const GATE_KEY = 'development'
const ATTEMPT_WINDOW_MS = 60_000
const ATTEMPT_LIMIT = 10
const ACCESS_TTL_MS = 12 * 60 * 60 * 1_000

export const seedDevelopmentAccessCode = internalMutation({
  args: {},
  returns: v.object({ seeded: v.boolean() }),
  handler: async (ctx) => {
    requireDevelopmentSite()
    const existing = await ctx.db
      .query('accessGateSettings')
      .withIndex('by_key', (q) => q.eq('key', GATE_KEY))
      .unique()
    if (existing) return { seeded: false }
    const code = requireAccessCode()
    await ctx.db.insert('accessGateSettings', {
      key: GATE_KEY,
      codeHash: await hashAccessCode(code, requireSecret()),
      updatedAt: Date.now(),
    })
    return { seeded: true }
  },
})

export const verifyAccessCode = mutation({
  args: { code: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(false) }),
    v.object({ ok: v.literal(true), token: v.string() }),
  ),
  handler: async (ctx, args) => {
    const code = args.code.trim()
    if (!code || code.length > 200) return { ok: false as const }
    const settings = await ctx.db
      .query('accessGateSettings')
      .withIndex('by_key', (q) => q.eq('key', GATE_KEY))
      .unique()
    if (!settings) return { ok: false as const }
    const now = Date.now()
    const inWindow =
      settings.attemptWindowStartedAt !== undefined &&
      now - settings.attemptWindowStartedAt < ATTEMPT_WINDOW_MS
    if (inWindow && (settings.attemptCount ?? 0) >= ATTEMPT_LIMIT) {
      return { ok: false as const }
    }
    await ctx.db.patch(settings._id, {
      attemptWindowStartedAt: inWindow
        ? settings.attemptWindowStartedAt
        : now,
      attemptCount: inWindow ? (settings.attemptCount ?? 0) + 1 : 1,
      updatedAt: now,
    })
    const candidate = await hashAccessCode(code, requireSecret())
    if (!timingSafeEqualString(candidate, settings.codeHash)) {
      return { ok: false as const }
    }
    return {
      ok: true as const,
      token: await createAccessToken(requireSecret(), now + ACCESS_TTL_MS),
    }
  },
})

export const validateAccessToken = action({
  args: { token: v.string() },
  returns: v.boolean(),
  handler: async (_ctx, args) =>
    args.token.length <= 200 &&
    (await verifyAccessToken(args.token, requireSecret())),
})

function requireSecret() {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || secret.trim() !== secret || secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters')
  }
  return secret
}

function requireAccessCode() {
  const code = process.env.PEEK_ACCESS_CODE?.trim()
  if (!code || code.length < 10 || code.length > 200) {
    throw new Error('PEEK_ACCESS_CODE must contain 10 to 200 characters')
  }
  return code
}

function requireDevelopmentSite() {
  const siteUrl = process.env.SITE_URL
  if (!siteUrl) throw new Error('SITE_URL is required')
  const hostname = new URL(siteUrl).hostname
  if (!['localhost', '127.0.0.1', '[::1]'].includes(hostname)) {
    throw new Error('DEVELOPMENT_SEED_ONLY')
  }
}
