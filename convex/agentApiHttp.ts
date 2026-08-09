import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { hashAgentToken, parseAgentToken } from './lib/agentApi'

export const status = httpAction(async (ctx, request) => {
  const rawToken = bearerToken(request)
  const parsed = parseAgentToken(rawToken)
  if (!parsed) return json({ error: 'unauthorized' }, 401)

  const status = await ctx.runQuery(internal.agentApiInternal.statusForToken, {
    tokenId: parsed.tokenId,
    tokenHash: await hashAgentToken(rawToken),
  })
  return status ? json(status, 200) : json({ error: 'unauthorized' }, 401)
})

export const events = httpAction(async (ctx, request) => {
  const rawToken = bearerToken(request)
  const parsed = parseAgentToken(rawToken)
  if (!parsed) return json({ error: 'unauthorized' }, 401)

  const event = await readEvent(request)
  if (!event) return json({ error: 'invalid_request' }, 400)
  const result = await ctx.runMutation(
    internal.agentApiInternal.recordEventForToken,
    {
      ...event,
      tokenId: parsed.tokenId,
      tokenHash: await hashAgentToken(rawToken),
    },
  )
  return result ? json(result, 202) : json({ error: 'unauthorized' }, 401)
})

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
}

async function readEvent(request: Request) {
  const body: unknown = await request.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const event = body as Record<string, unknown>
  const type = normalizedString(event.type, 80)
  const summary = normalizedString(event.summary, 2_000)
  const eventId =
    event.eventId === undefined
      ? crypto.randomUUID()
      : normalizedString(event.eventId, 200)
  const runId =
    event.runId === undefined ? undefined : normalizedString(event.runId, 200)
  const occurredAt = event.occurredAt ?? Date.now()
  if (
    !type ||
    !summary ||
    !eventId ||
    (event.runId !== undefined && !runId) ||
    typeof occurredAt !== 'number' ||
    !Number.isFinite(occurredAt) ||
    occurredAt < 0
  ) {
    return null
  }
  return runId
    ? { eventId, runId, type, summary, occurredAt }
    : { eventId, type, summary, occurredAt }
}

function normalizedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : null
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
