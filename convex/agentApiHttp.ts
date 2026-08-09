import { internal } from './_generated/api'
import { httpAction } from './_generated/server'
import { hashAgentToken, parseAgentToken } from './lib/agentApi'

const MAX_EVENT_BODY_BYTES = 16 * 1_024
const BODY_TOO_LARGE = Symbol('BODY_TOO_LARGE')

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
  const tokenHash = await hashAgentToken(rawToken)
  const authenticated = await ctx.runQuery(
    internal.agentApiInternal.authenticateToken,
    { tokenId: parsed.tokenId, tokenHash },
  )
  if (!authenticated) return json({ error: 'unauthorized' }, 401)

  let event: Awaited<ReturnType<typeof readEvent>>
  try {
    event = await readEvent(request)
  } catch (error) {
    if (error === BODY_TOO_LARGE) {
      return json({ error: 'payload_too_large' }, 413)
    }
    throw error
  }
  if (!event) return json({ error: 'invalid_request' }, 400)
  const result = await ctx.runMutation(
    internal.agentApiInternal.recordEventForToken,
    {
      ...event,
      tokenId: parsed.tokenId,
      tokenHash,
    },
  )
  if (result && 'rateLimited' in result) {
    return json({ error: 'rate_limited' }, 429, { 'retry-after': '60' })
  }
  return result ? json(result, 202) : json({ error: 'unauthorized' }, 401)
})

function bearerToken(request: Request) {
  const authorization = request.headers.get('authorization')
  return authorization?.startsWith('Bearer ')
    ? authorization.slice('Bearer '.length).trim()
    : ''
}

async function readEvent(request: Request) {
  const body = await readJsonBody(request)
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

async function readJsonBody(request: Request): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_EVENT_BODY_BYTES) {
    throw BODY_TOO_LARGE
  }
  if (!request.body) return null
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_EVENT_BODY_BYTES) {
      await reader.cancel()
      throw BODY_TOO_LARGE
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    return null
  }
}

function normalizedString(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  return normalized && normalized.length <= maxLength ? normalized : null
}

function json(body: unknown, status: number, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}
