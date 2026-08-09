import { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import { ACCESS_GRANT_HEADER } from '../../convex/lib/accessGateCrypto'

const ACCESS_COOKIE = 'peek_access'
const ACCESS_COOKIE_MAX_AGE = 12 * 60 * 60
const MAX_ACCESS_BODY_BYTES = 1_024

export function accessCookie(token: string, production: boolean) {
  return [
    `${cookieName(production)}=${token}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/',
    `Max-Age=${ACCESS_COOKIE_MAX_AGE}`,
    production ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ')
}

export function clearAccessCookie(production: boolean) {
  return accessCookie('', production).replace(
    `Max-Age=${ACCESS_COOKIE_MAX_AGE}`,
    'Max-Age=0',
  )
}

export function readAccessToken(request: Request, production: boolean) {
  const expected = cookieName(production)
  for (const part of (request.headers.get('cookie') ?? '').split(/;\s*/)) {
    const separator = part.indexOf('=')
    if (separator !== -1 && part.slice(0, separator) === expected) {
      return part.slice(separator + 1)
    }
  }
  return null
}

export function requiresAccessGate(request: Request) {
  if (request.method !== 'POST') return false
  const pathname = new URL(request.url).pathname
  return (
    pathname === '/api/auth/sign-in' ||
    pathname.startsWith('/api/auth/sign-in/') ||
    pathname === '/api/auth/sign-up' ||
    pathname.startsWith('/api/auth/sign-up/')
  )
}

export function forwardAccessGrant(request: Request, production: boolean) {
  const token = readAccessToken(request, production)
  if (!token) return null
  const headers = new Headers(request.headers)
  headers.set(ACCESS_GRANT_HEADER, token)
  return new Request(request, { headers })
}

export function isSameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin
}

export async function hasAccessGate(request: Request) {
  const token = readAccessToken(request, isProduction())
  if (!token) return false
  try {
    return await convex().action(api.accessGate.validateAccessToken, { token })
  } catch {
    return false
  }
}

export async function verifyManagedAccessCode(code: string) {
  return await convex().mutation(api.accessGate.verifyAccessCode, { code })
}

export async function readAccessCode(request: Request) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_ACCESS_BODY_BYTES) return null
  const reader = request.body?.getReader()
  if (!reader) return null
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_ACCESS_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(body)) as {
      code?: unknown
    }
    return typeof parsed.code === 'string' ? parsed.code : null
  } catch {
    return null
  }
}

export function isProduction() {
  return process.env.NODE_ENV === 'production'
}

function cookieName(production: boolean) {
  return production ? `__Host-${ACCESS_COOKIE}` : ACCESS_COOKIE
}

function convex() {
  const url = process.env.VITE_CONVEX_URL
  if (!url) throw new Error('VITE_CONVEX_URL is required')
  return new ConvexHttpClient(url)
}
