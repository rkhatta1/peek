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

  test('disables rate limiting through the deployment flag', async () => {
    const secret = 'test-secret-at-least-32-characters-long'
    vi.stubEnv('BETTER_AUTH_SECRET', secret)
    vi.stubEnv('SITE_URL', 'http://localhost:3000')
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('AUTH_RATE_LIMIT_ENABLED', 'false')
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

  test('provisions and rotates the production access code from deployment env', async () => {
    vi.stubEnv('SITE_URL', 'https://peek.example.com')
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-at-least-32-characters-long')
    vi.stubEnv('PEEK_ACCESS_CODE', 'ABC1234')
    const t = convexTest(schema, modules)

    await expect(
      t.mutation(internal.accessGate.provisionAccessCode, {}),
    ).resolves.toEqual({ created: true })
    await expect(
      t.mutation(api.accessGate.verifyAccessCode, { code: 'ABC1234' }),
    ).resolves.toMatchObject({ ok: true })

    vi.stubEnv('PEEK_ACCESS_CODE', 'NEXT5678')
    await expect(
      t.mutation(internal.accessGate.provisionAccessCode, {}),
    ).resolves.toEqual({ created: false })
    await expect(
      t.mutation(api.accessGate.verifyAccessCode, { code: 'ABC1234' }),
    ).resolves.toEqual({ ok: false })
    await expect(
      t.mutation(api.accessGate.verifyAccessCode, { code: 'NEXT5678' }),
    ).resolves.toMatchObject({ ok: true })
  })

  test('enforces the 6 to 12 character provisioning policy', async () => {
    vi.stubEnv('SITE_URL', 'https://peek.example.com')
    vi.stubEnv('BETTER_AUTH_SECRET', 'test-secret-at-least-32-characters-long')
    const t = convexTest(schema, modules)

    for (const code of ['12345', '1234567890123']) {
      vi.stubEnv('PEEK_ACCESS_CODE', code)
      await expect(
        t.mutation(internal.accessGate.provisionAccessCode, {}),
      ).rejects.toThrow('PEEK_ACCESS_CODE must contain 6 to 12 characters')
    }

    for (const code of ['123456', '123456789012']) {
      vi.stubEnv('PEEK_ACCESS_CODE', code)
      await expect(
        t.mutation(internal.accessGate.provisionAccessCode, {}),
      ).resolves.toEqual({ created: code === '123456' })
    }
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
