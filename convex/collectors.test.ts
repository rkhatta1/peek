/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { afterEach, describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const MINUTE_MS = 60_000

function testBackend() {
  return convexTest(schema, modules)
}

afterEach(() => {
  vi.useRealTimers()
})

describe('scheduled Service collection', () => {
  test('uses each Project interval and fences a run invalidated by a settings change', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })
    const scheduledChecks = async () =>
      (
        await owner.query(api.checkTriggers.list, {
          projectId,
          attentionOnly: false,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).page.filter((trigger) => trigger.source === 'scheduled')

    await owner.mutation(api.projects.updateCollectionInterval, {
      projectId,
      intervalMinutes: 5,
    })
    await t.run(async (ctx) => {
      for (let index = 0; index < 26; index += 1) {
        const serviceId = await ctx.db.insert('serviceConnections', {
          clientId,
          projectId,
          ownerId: 'peek|owner',
          provider: 'neon',
          name: `Database ${index + 1}`,
          normalizedName: `database ${index + 1}`,
          environment: 'Production',
          active: true,
          status: 'active',
          credentialState: 'valid',
          lastValidatedAt: 1_000,
          createdAt: 1_000 + index,
          updatedAt: 1_000 + index,
        })
        await ctx.db.insert('serviceCredentials', {
          serviceId,
          ownerId: 'peek|owner',
          algorithm: 'AES-GCM',
          binding: 'invalid-binding',
          ciphertext: 'invalid-ciphertext',
          iv: 'invalid-iv',
          keyId: 'key-v1',
          createdAt: 1_000,
          updatedAt: 1_000,
        })
      }
    })

    await expect(
      t.mutation(internal.collectorInternal.dispatchScheduledCollections, {}),
    ).resolves.toBe(0)
    vi.setSystemTime(1_000 + 5 * MINUTE_MS)
    await expect(
      t.mutation(internal.collectorInternal.dispatchScheduledCollections, {}),
    ).resolves.toBe(1)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await scheduledChecks()).toMatchObject([
      {
        serviceCount: 26,
        operationalCount: 0,
        attentionCount: 0,
        unavailableCount: 26,
      },
    ])

    vi.setSystemTime(1_000 + 10 * MINUTE_MS)
    await expect(
      t.mutation(internal.collectorInternal.dispatchScheduledCollections, {}),
    ).resolves.toBe(1)
    await owner.mutation(api.projects.updateCollectionInterval, {
      projectId,
      intervalMinutes: 10,
    })
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await scheduledChecks()).toHaveLength(1)

    vi.setSystemTime(1_000 + 20 * MINUTE_MS)
    await expect(
      t.mutation(internal.collectorInternal.dispatchScheduledCollections, {}),
    ).resolves.toBe(1)
    await t.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await scheduledChecks()).toHaveLength(2)
  })
})
