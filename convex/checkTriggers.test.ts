/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

describe('Check trigger details', () => {
  test('returns immutable service events and keeps them owner-scoped', async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const stranger = t.withIdentity({ tokenIdentifier: 'peek|stranger' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })
    const capturedAt = 1_786_000_000_000
    const serviceId = await owner.mutation(
      internal.serviceInternal.commitConnectedService,
      {
        ownerId: 'peek|owner',
        projectId,
        name: 'Primary cache',
        environment: 'Production',
        provider: 'upstash',
        encryptedCredentials: {
          algorithm: 'AES-GCM',
          binding: 'binding',
          ciphertext: 'ciphertext',
          iv: 'iv',
          keyId: 'key-v1',
        },
        snapshot: {
          provider: 'upstash',
          capturedAt,
          status: 'operational',
          connections: 4,
          cacheHitRatio: 0.92,
          requestCount: 12_000,
          storageBytes: 8_192,
          p99LatencyMs: 120,
        },
      },
    )
    const trigger = (
      await owner.query(api.checkTriggers.list, {
        projectId,
        attentionOnly: false,
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page[0]

    await owner.mutation(api.services.update, {
      serviceId,
      name: 'Renamed cache',
      environment: 'Staging',
      active: true,
    })

    const details = await owner.query(api.checkTriggers.getDetails, {
      triggerId: trigger._id,
    })
    expect(details).toMatchObject({
      trigger: {
        _id: trigger._id,
        projectId,
        source: 'connection',
        status: 'attention',
      },
      events: [
        {
          serviceId,
          serviceName: 'Primary cache',
          environment: 'Production',
          provider: 'upstash',
          capturedAt,
          p99LatencyMs: 120,
        },
      ],
      truncated: false,
    })
    expect(JSON.stringify(details)).not.toContain('peek|owner')
    await expect(
      stranger.query(api.checkTriggers.getDetails, {
        triggerId: trigger._id,
      }),
    ).rejects.toThrow('Trigger not found')
  })
})
