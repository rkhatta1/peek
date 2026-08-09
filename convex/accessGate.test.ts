/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import { createAccessToken, verifyAccessToken } from './lib/accessGateCrypto'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

afterEach(() => vi.unstubAllEnvs())

describe('access gate', () => {
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
