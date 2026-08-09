/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { register as registerBetterAuth } from '@convex-dev/better-auth/test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import { createAccessToken, verifyAccessToken } from './lib/accessGateCrypto'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

afterEach(() => vi.unstubAllEnvs())

describe('access gate', () => {
  test('guards credential endpoints at the public Convex boundary', async () => {
    const secret = 'test-secret-at-least-32-characters-long'
    vi.stubEnv('BETTER_AUTH_SECRET', secret)
    vi.stubEnv('SITE_URL', 'http://localhost:3000')
    const t = convexTest(schema, modules)
    registerBetterAuth(t)
    const body = '{}'

    const denied = await t.fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
    expect(denied.status).toBe(403)

    const token = await createAccessToken(secret, Date.now() + 60_000)
    const allowed = await t.fetch('/api/auth/sign-up/email', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-peek-access-grant': token,
      },
      body,
    })
    expect(allowed.status).not.toBe(403)

    const signOut = await t.fetch('/api/auth/sign-out', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
    expect(signOut.status).not.toBe(403)
  })

  test('does not rate limit credential requests outside production', async () => {
    const secret = 'test-secret-at-least-32-characters-long'
    vi.stubEnv('BETTER_AUTH_SECRET', secret)
    vi.stubEnv('SITE_URL', 'http://localhost:3000')
    vi.stubEnv('NODE_ENV', 'development')
    const t = convexTest(schema, modules)
    registerBetterAuth(t)
    const token = await createAccessToken(secret, Date.now() + 60_000)
    const statuses: number[] = []

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await t.fetch('/api/auth/sign-up/email', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-peek-access-grant': token,
        },
        body: '{}',
      })
      statuses.push(response.status)
    }

    expect(statuses).toEqual([400, 400, 400, 400])
  })

  test('seeds the managed development code once and issues a signed grant', async () => {
    vi.stubEnv('SITE_URL', 'http://localhost:3000')
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-at-least-32-characters-long')
    vi.stubEnv('PEEK_ACCESS_CODE', 'MRHIA361120')
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(internal.accessGate.seedDevelopmentAccessCode, {}),
    ).resolves.toEqual({ seeded: true })
    await expect(
      t.mutation(internal.accessGate.seedDevelopmentAccessCode, {}),
    ).resolves.toEqual({ seeded: false })
    await expect(
      t.mutation(api.accessGate.verifyAccessCode, { code: 'wrong-code' }),
    ).resolves.toEqual({ ok: false })

    const verified = await t.mutation(api.accessGate.verifyAccessCode, {
      code: 'MRHIA361120',
    })
    expect(verified.ok).toBe(true)
    if (!verified.ok) throw new Error('Expected access grant')
    await expect(
      t.action(api.accessGate.validateAccessToken, { token: verified.token }),
    ).resolves.toBe(true)
  })

  test('rejects forged and expired access tokens', async () => {
    const secret = 'test-secret-at-least-32-characters-long'
    const token = await createAccessToken(secret, 2_000)

    await expect(verifyAccessToken(token, secret, 1_000)).resolves.toBe(true)
    await expect(verifyAccessToken(`${token}x`, secret, 1_000)).resolves.toBe(
      false,
    )
    await expect(verifyAccessToken(token, secret, 2_001)).resolves.toBe(false)
  })
})
