/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { describe, expect, test, vi } from 'vitest'

import { api, internal } from './_generated/api'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')

function testBackend() {
  return convexTest(schema, modules)
}

describe('Client → Project → Service', () => {
  test('supports tenant-isolated client and project CRUD', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const stranger = t.withIdentity({ tokenIdentifier: 'peek|stranger' })

    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    expect(await owner.query(api.clients.list)).toMatchObject([{ name: 'Acme' }])
    expect(await owner.query(api.projects.listByClient, { clientId })).toMatchObject([
      { name: 'Atlas' },
    ])
    expect(await stranger.query(api.clients.list)).toEqual([])
    await expect(
      stranger.mutation(api.projects.update, { projectId, name: 'Stolen' }),
    ).rejects.toThrow('Project not found')

    await owner.mutation(api.clients.update, { clientId, name: 'Acme Labs' })
    await owner.mutation(api.projects.update, { projectId, name: 'Atlas API' })

    expect(await owner.query(api.clients.list)).toMatchObject([{ name: 'Acme Labs' }])
    expect(await owner.query(api.projects.listByClient, { clientId })).toMatchObject([
      { name: 'Atlas API' },
    ])
  })

  test('lets the Project owner configure a whole-minute collection interval', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const stranger = t.withIdentity({ tokenIdentifier: 'peek|stranger' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    expect(await owner.query(api.projects.listByClient, { clientId })).toMatchObject([
      { collectionIntervalMinutes: 15 },
    ])

    await owner.mutation(api.projects.updateCollectionInterval, {
      projectId,
      intervalMinutes: 5,
    })

    expect(await owner.query(api.projects.listByClient, { clientId })).toMatchObject([
      { collectionIntervalMinutes: 5 },
    ])
    await expect(
      stranger.mutation(api.projects.updateCollectionInterval, {
        projectId,
        intervalMinutes: 10,
      }),
    ).rejects.toThrow('Project not found')
    await expect(
      owner.mutation(api.projects.updateCollectionInterval, {
        projectId,
        intervalMinutes: 1.5,
      }),
    ).rejects.toThrow('Collection interval must be a whole number')
  })

  test('keeps app-wide monitoring summary latest-only and bounds Overview history', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const stranger = t.withIdentity({ tokenIdentifier: 'peek|stranger' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })
    const serviceId = await t.run(async (ctx) => {
      const id = await ctx.db.insert('serviceConnections', {
        clientId,
        projectId,
        ownerId: 'peek|owner',
        provider: 'neon',
        name: 'Primary database',
        normalizedName: 'primary database',
        environment: 'Production',
        active: true,
        status: 'active',
        credentialState: 'valid',
        lastValidatedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      for (let capturedAt = 1; capturedAt <= 100; capturedAt += 1) {
        await ctx.db.insert('serviceMetricSnapshots', {
          clientId,
          projectId,
          serviceId: id,
          ownerId: 'peek|owner',
          provider: 'neon',
          capturedAt,
          status: 'operational',
          connections: capturedAt,
          cacheHitRatio: 1,
        })
      }
      return id
    })

    const summary = await owner.query(api.monitoring.getSummary, { projectId })
    expect(summary.providers).toHaveLength(1)
    expect(summary.providers[0]).toMatchObject({
      connection: { _id: serviceId },
      latest: { capturedAt: 100 },
    })
    expect('history' in summary.providers[0]).toBe(false)

    const histories = await owner.query(api.monitoring.getHistory, { projectId })
    expect(histories).toHaveLength(1)
    expect(histories[0].serviceId).toBe(serviceId)
    expect(histories[0].history).toHaveLength(96)
    expect(histories[0].history[0].capturedAt).toBe(5)
    expect(histories[0].history[95].capturedAt).toBe(100)
    await expect(
      stranger.query(api.monitoring.getHistory, { projectId }),
    ).rejects.toThrow('Project not found')
  })

  test('never returns encrypted credentials from public service queries', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    const serviceId = await owner.mutation(internal.serviceInternal.commitConnectedService, {
      ownerId: 'peek|owner',
      projectId,
      name: 'Primary database',
      environment: 'Production',
      provider: 'neon',
      encryptedCredentials: {
        algorithm: 'AES-GCM',
        binding: 'binding',
        ciphertext: 'super-secret-ciphertext',
        iv: 'initialization-vector',
        keyId: 'key-v1',
      },
      snapshot: {
        provider: 'neon',
        capturedAt: 1_786_000_000_000,
        status: 'operational',
        connections: 2,
        cacheHitRatio: 0.99,
        deadlocks: 0,
        logicalSizeBytes: 1024,
        queryInsightsEnabled: true,
      },
    })

    const services = await owner.query(api.services.listByProject, { projectId })
    expect(services).toMatchObject([
      {
        _id: serviceId,
        name: 'Primary database',
        provider: 'neon',
        credentialState: 'valid',
      },
    ])
    expect(JSON.stringify(services)).not.toContain('super-secret-ciphertext')
    expect(JSON.stringify(services)).not.toContain('initialization-vector')
  })

  test('deleting a client immediately hides descendants and removes credentials', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    await owner.mutation(internal.serviceInternal.commitConnectedService, {
      ownerId: 'peek|owner',
      projectId,
      name: 'Cache',
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
        capturedAt: 1_786_000_000_000,
        status: 'operational',
        connections: 1,
        cacheHitRatio: 0.95,
        requestCount: 10,
        storageBytes: 256,
        p99LatencyMs: 4,
      },
    })
    await owner.mutation(
      internal.codeConnectionInternal.commitValidatedConnection,
      {
        ownerId: 'peek|owner',
        projectId,
        provider: 'vercel',
        externalId: 'prj_atlas',
        externalSlug: 'atlas',
        name: 'atlas',
        encryptedCredentials: {
          algorithm: 'AES-GCM',
          binding: 'code-binding',
          ciphertext: 'vercel-client-ciphertext',
          iv: 'code-initialization-vector',
          keyId: 'key-v1',
        },
      },
    )

    await owner.mutation(api.clients.remove, { clientId })

    expect(await owner.query(api.clients.list)).toEqual([])
    await expect(owner.query(api.projects.listByClient, { clientId })).rejects.toThrow(
      'Client not found',
    )
    const credentialCount = await t.run(async (ctx) =>
      (await ctx.db.query('serviceCredentials').take(10)).length,
    )
    expect(credentialCount).toBe(0)
    const codeCredentialCount = await t.run(async (ctx) =>
      (await ctx.db.query('codeConnectionCredentials').take(10)).length,
    )
    expect(codeCredentialCount).toBe(0)
  })

  test('an inactive ancestor blocks stale project and service IDs', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    await t.run(async (ctx) => {
      await ctx.db.patch(clientId, { status: 'deleted' })
    })

    await expect(
      owner.query(api.services.listByProject, { projectId }),
    ).rejects.toThrow('Project not found')
    await expect(
      owner.query(api.monitoring.getSummary, { projectId }),
    ).rejects.toThrow('Project not found')
    await expect(
      owner.query(api.monitoring.getHistory, { projectId }),
    ).rejects.toThrow('Project not found')
  })
})

describe('Project code connections', () => {
  test('lists one owner-isolated GitHub or Vercel connection per provider', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const stranger = t.withIdentity({ tokenIdentifier: 'peek|stranger' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    const connectionId = await owner.mutation(
      internal.codeConnectionInternal.commitValidatedConnection,
      {
        ownerId: 'peek|owner',
        projectId,
        provider: 'github',
        externalId: '123456',
        externalSlug: 'acme/atlas',
        name: 'acme/atlas',
        encryptedCredentials: {
          algorithm: 'AES-GCM',
          binding: 'code-binding',
          ciphertext: 'github-client-ciphertext',
          iv: 'code-initialization-vector',
          keyId: 'key-v1',
        },
      },
    )

    const connections = await owner.query(api.codeConnections.listByProject, {
      projectId,
    })
    expect(connections).toEqual([
      expect.objectContaining({
        _id: connectionId,
        provider: 'github',
        externalSlug: 'acme/atlas',
        branch: 'main',
        environment: 'production',
      }),
    ])
    expect(JSON.stringify(connections)).not.toContain('github-client-ciphertext')
    await expect(
      stranger.query(api.codeConnections.listByProject, { projectId }),
    ).rejects.toThrow('Project not found')
  })

  test('leases commit syncs and fences stale page and finish writes', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    try {
      const t = testBackend()
      const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
      const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
      const projectId = await owner.mutation(api.projects.create, {
        clientId,
        name: 'Atlas',
      })
      const connectionId = await owner.mutation(
        internal.codeConnectionInternal.commitValidatedConnection,
        {
          ownerId: 'peek|owner',
          projectId,
          provider: 'github',
          externalId: '123456',
          externalSlug: 'acme/atlas',
          name: 'acme/atlas',
          encryptedCredentials: {
            algorithm: 'AES-GCM',
            binding: 'code-binding',
            ciphertext: 'github-client-ciphertext',
            iv: 'code-initialization-vector',
            keyId: 'key-v1',
          },
        },
      )

      await owner.mutation(internal.codeConnectionInternal.claimCommitSync, {
        ownerId: 'peek|owner',
        projectId,
        connectionId,
        runId: 'run-1',
      })
      await expect(
        owner.mutation(internal.codeConnectionInternal.heartbeatCommitSync, {
          ownerId: 'peek|owner',
          projectId,
          connectionId,
          runId: 'run-1',
        }),
      ).resolves.toBe(true)
      await expect(
        owner.mutation(internal.codeConnectionInternal.claimCommitSync, {
          ownerId: 'peek|owner',
          projectId,
          connectionId,
          runId: 'run-2',
        }),
      ).rejects.toThrow('COMMIT_SYNC_IN_PROGRESS')

      clock.mockReturnValue(61_001)
      await owner.mutation(internal.codeConnectionInternal.claimCommitSync, {
        ownerId: 'peek|owner',
        projectId,
        connectionId,
        runId: 'run-2',
      })
      await expect(
        owner.mutation(internal.codeConnectionInternal.heartbeatCommitSync, {
          ownerId: 'peek|owner',
          projectId,
          connectionId,
          runId: 'run-1',
        }),
      ).resolves.toBe(false)
      await expect(
        owner.mutation(
          internal.codeConnectionInternal.commitValidatedConnection,
          {
            ownerId: 'peek|owner',
            projectId,
            provider: 'github',
            externalId: '123456',
            externalSlug: 'acme/atlas',
            name: 'acme/atlas',
            encryptedCredentials: {
              algorithm: 'AES-GCM',
              binding: 'code-binding',
              ciphertext: 'github-client-ciphertext',
              iv: 'code-initialization-vector',
              keyId: 'key-v1',
            },
            replace: true,
            commitSyncRunId: 'run-1',
          },
        ),
      ).rejects.toThrow('COMMIT_SYNC_STALE')
      await expect(
        owner.mutation(internal.agentCommitInternal.upsertPage, {
          ownerId: 'peek|owner',
          projectId,
          connectionId,
          runId: 'run-1',
          commits: [],
        }),
      ).rejects.toThrow('COMMIT_SYNC_STALE')
      await expect(
        owner.mutation(internal.agentCommitInternal.finishSync, {
          ownerId: 'peek|owner',
          connectionId,
          runId: 'run-1',
          headSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        }),
      ).resolves.toBe(false)
      await expect(
        owner.mutation(internal.agentCommitInternal.finishSync, {
          ownerId: 'peek|owner',
          connectionId,
          runId: 'run-2',
          headSha: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        }),
      ).resolves.toBe(true)

      const [target] = await owner.query(
        internal.codeConnectionInternal.listResolutionTargets,
        { ownerId: 'peek|owner', projectId },
      )
      expect(target?.lastSyncedHeadSha).toBe(
        'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      )
    } finally {
      clock.mockRestore()
    }
  })
})

describe('Project agent endpoint', () => {
  test('creates a write-only token and returns empty commit-aware status', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const stranger = t.withIdentity({ tokenIdentifier: 'peek|stranger' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    const created = await owner.action(api.agentApiActions.rotateToken, {
      projectId,
    })
    const settings = await owner.query(api.agentApi.getSettings, { projectId })

    expect(created.token).toMatch(/^peek_[a-f0-9]{24}_[a-f0-9]{64}$/)
    expect(settings).toEqual({
      token: {
        createdAt: expect.any(Number),
        hint: created.token.slice(-6),
      },
    })
    expect(JSON.stringify(settings)).not.toContain(created.token)
    expect(await stranger.query(api.clients.list)).toEqual([])

    const status = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${created.token}` },
    })
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({
      comment: '',
      commitHash: null,
      commitTitle: null,
      eventStats: null,
    })

    await t.run(async (ctx) => {
      const endpoint = await ctx.db
        .query('agentEndpoints')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .unique()
      if (!endpoint) throw new Error('Missing endpoint')
      await ctx.db.patch(endpoint._id, { comment: 'Legacy rollout guidance.' })
    })
    const legacyStatus = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${created.token}` },
    })
    expect(await legacyStatus.json()).toEqual({
      comment: 'Legacy rollout guidance.',
      commitHash: null,
      commitTitle: null,
      eventStats: null,
    })

    const rotated = await owner.action(api.agentApiActions.rotateToken, {
      projectId,
    })
    const staleStatus = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${created.token}` },
    })
    const currentStatus = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${rotated.token}` },
    })
    expect(staleStatus.status).toBe(401)
    expect(await currentStatus.json()).toEqual({
      comment: 'Legacy rollout guidance.',
      commitHash: null,
      commitTitle: null,
      eventStats: null,
    })
  })

  test('accepts idempotent agent events and returns commit-aware status', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })
    const { token } = await owner.action(api.agentApiActions.rotateToken, {
      projectId,
    })
    const event = {
      eventId: 'evt_checkout_tests',
      runId: 'run_checkout',
      type: 'test.completed',
      summary: 'Checkout tests passed.',
      occurredAt: 1_786_000_000_000,
    }

    const unauthorized = await t.fetch('/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    })
    expect(unauthorized.status).toBe(401)
    const forged = await t.fetch('/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer peek_${'a'.repeat(24)}_${'b'.repeat(64)}`,
        'content-type': 'application/json',
      },
      body: '{',
    })
    expect(forged.status).toBe(401)

    const oversized = await t.fetch('/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        type: 'test.completed',
        summary: 'x'.repeat(17_000),
      }),
    })
    expect(oversized.status).toBe(413)

    const first = await t.fetch('/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    })
    const duplicate = await t.fetch('/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    })

    expect(first.status).toBe(202)
    expect(await first.json()).toEqual({
      accepted: true,
      comment: '',
      commitHash: null,
      commitTitle: null,
      duplicate: false,
      eventStats: null,
      eventId: event.eventId,
    })
    expect(await duplicate.json()).toEqual({
      accepted: true,
      comment: '',
      commitHash: null,
      commitTitle: null,
      duplicate: true,
      eventStats: null,
      eventId: event.eventId,
    })
    await t.run(async (ctx) => {
      const apiToken = await ctx.db
        .query('agentApiTokens')
        .withIndex('by_project', (q) => q.eq('projectId', projectId))
        .unique()
      if (!apiToken) throw new Error('Missing API token')
      await ctx.db.patch(apiToken._id, {
        eventWindowStartedAt: Date.now(),
        eventWindowCount: 60,
      })
    })
    const limited = await t.fetch('/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ ...event, eventId: 'evt_rate_limited' }),
    })
    expect(limited.status).toBe(429)
    expect(await owner.query(api.agentApi.listRecentEvents, { projectId })).toEqual([
      expect.objectContaining(event),
    ])
  })

  test('revokes agent access', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })
    const { token } = await owner.action(api.agentApiActions.rotateToken, {
      projectId,
    })
    await owner.mutation(api.agentApi.revokeToken, { projectId })
    const revokedStatus = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(revokedStatus.status).toBe(401)
    expect(await owner.query(api.agentApi.getSettings, { projectId })).toEqual({
      token: null,
    })

    const rotated = await owner.action(api.agentApiActions.rotateToken, {
      projectId,
    })
    await owner.mutation(api.projects.remove, { projectId })
    const deletedProjectStatus = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${rotated.token}` },
    })
    expect(deletedProjectStatus.status).toBe(401)
  })
})

describe('Check and Agent ledgers', () => {
  test('paginates immutable check triggers and returns stored totals', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })

    await owner.mutation(internal.checkTriggers.record, {
      ownerId: 'peek|owner',
      projectId,
      source: 'manual',
      triggeredAt: 200,
      completedAt: 220,
      serviceCount: 2,
      operationalCount: 1,
      attentionCount: 1,
      unavailableCount: 0,
    })
    await owner.mutation(internal.checkTriggers.record, {
      ownerId: 'peek|owner',
      projectId,
      source: 'scheduled',
      triggeredAt: 300,
      completedAt: 330,
      serviceCount: 2,
      operationalCount: 2,
      attentionCount: 0,
      unavailableCount: 0,
    })

    const first = await owner.query(api.checkTriggers.list, {
      projectId,
      attentionOnly: false,
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(first.page).toHaveLength(1)
    expect(first.page[0]).toMatchObject({ triggeredAt: 300, status: 'operational' })
    expect(first.isDone).toBe(false)

    const attention = await owner.query(api.checkTriggers.list, {
      projectId,
      attentionOnly: true,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(attention.page).toEqual([
      expect.objectContaining({ triggeredAt: 200, status: 'attention' }),
    ])
    expect(await owner.query(api.ledgerTotals.get, { projectId })).toEqual({
      agentCommits: 0,
      checkAttentionTriggers: 1,
      checkTriggers: 2,
    })
  })

  test('attaches guidance to a main commit and returns its next trigger stats', async () => {
    const t = testBackend()
    const owner = t.withIdentity({ tokenIdentifier: 'peek|owner' })
    const clientId = await owner.mutation(api.clients.create, { name: 'Acme' })
    const projectId = await owner.mutation(api.projects.create, {
      clientId,
      name: 'Atlas',
    })
    const connectionId = await owner.mutation(
      internal.codeConnectionInternal.commitValidatedConnection,
      {
        ownerId: 'peek|owner',
        projectId,
        provider: 'github',
        externalId: '123',
        externalSlug: 'acme/atlas',
        name: 'acme/atlas',
        encryptedCredentials: {
          algorithm: 'AES-GCM',
          binding: 'binding',
          ciphertext: 'ciphertext',
          iv: 'iv',
          keyId: 'key-v1',
        },
      },
    )
    await owner.mutation(internal.checkTriggers.record, {
      ownerId: 'peek|owner',
      projectId,
      source: 'scheduled',
      triggeredAt: 100,
      completedAt: 110,
      serviceCount: 1,
      operationalCount: 1,
      attentionCount: 0,
      unavailableCount: 0,
    })
    await owner.mutation(internal.checkTriggers.record, {
      ownerId: 'peek|owner',
      projectId,
      source: 'scheduled',
      triggeredAt: 300,
      completedAt: 320,
      serviceCount: 2,
      operationalCount: 1,
      attentionCount: 1,
      unavailableCount: 0,
    })
    await owner.mutation(internal.codeConnectionInternal.claimCommitSync, {
      ownerId: 'peek|owner',
      projectId,
      connectionId,
      runId: 'fixture-sync',
    })
    await owner.mutation(internal.agentCommitInternal.upsertPage, {
      ownerId: 'peek|owner',
      projectId,
      connectionId,
      runId: 'fixture-sync',
      commits: [
        {
          sha: '0123456789abcdef0123456789abcdef01234567',
          title: 'Add guarded rollout',
          author: 'Octocat',
          committedAt: 200,
          url: 'https://github.com/acme/atlas/commit/0123456789abcdef0123456789abcdef01234567',
        },
      ],
    })

    const commits = await owner.query(api.agentCommits.list, {
      projectId,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(commits.page).toHaveLength(1)
    await owner.mutation(api.agentCommits.setComment, {
      commitId: commits.page[0]._id,
      comment: 'Verify the rollout guard before continuing.',
    })
    const { token } = await owner.action(api.agentApiActions.rotateToken, {
      projectId,
    })

    const status = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({
      comment: 'Verify the rollout guard before continuing.',
      commitHash: '0123456789abcdef0123456789abcdef01234567',
      commitTitle: 'Add guarded rollout',
      eventStats: {
        attention: 1,
        completedAt: 320,
        operational: 1,
        services: 2,
        status: 'attention',
        triggeredAt: 300,
        unavailable: 0,
      },
    })
    expect(await owner.query(api.ledgerTotals.get, { projectId })).toMatchObject({
      agentCommits: 1,
    })

    const replacementConnectionId = await owner.mutation(
      internal.codeConnectionInternal.commitValidatedConnection,
      {
        ownerId: 'peek|owner',
        projectId,
        provider: 'github',
        externalId: '456',
        externalSlug: 'acme/replacement',
        name: 'acme/replacement',
        encryptedCredentials: {
          algorithm: 'AES-GCM',
          binding: 'replacement-binding',
          ciphertext: 'replacement-ciphertext',
          iv: 'replacement-iv',
          keyId: 'key-v1',
        },
      },
    )
    expect(replacementConnectionId).not.toBe(connectionId)

    const replacementCommits = await owner.query(api.agentCommits.list, {
      projectId,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(replacementCommits.page).toEqual([])

    const replacementStatus = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(await replacementStatus.json()).toEqual({
      comment: '',
      commitHash: null,
      commitTitle: null,
      eventStats: null,
    })
  })
})
