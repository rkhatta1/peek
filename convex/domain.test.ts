/// <reference types="vite/client" />

import { convexTest } from 'convex-test'
import { describe, expect, test } from 'vitest'

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
      owner.query(api.monitoring.getOverview, { projectId }),
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
})

describe('Project agent endpoint', () => {
  test('creates a write-only token and returns the current status comment', async () => {
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
      comment: '',
      token: {
        createdAt: expect.any(Number),
        hint: created.token.slice(-6),
      },
    })
    expect(JSON.stringify(settings)).not.toContain(created.token)

    await expect(
      stranger.mutation(api.agentApi.updateComment, {
        projectId,
        comment: 'Ship it.',
      }),
    ).rejects.toThrow('Project not found')
    await owner.mutation(api.agentApi.updateComment, {
      projectId,
      comment: 'Run the migration before deploying.',
    })

    const status = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${created.token}` },
    })
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({
      comment: 'Run the migration before deploying.',
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
      comment: 'Run the migration before deploying.',
    })
  })

  test('accepts idempotent agent events and returns the status comment', async () => {
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
    await owner.mutation(api.agentApi.updateComment, {
      projectId,
      comment: 'Pause before deployment.',
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
      comment: 'Pause before deployment.',
      duplicate: false,
      eventId: event.eventId,
    })
    expect(await duplicate.json()).toEqual({
      accepted: true,
      comment: 'Pause before deployment.',
      duplicate: true,
      eventId: event.eventId,
    })
    expect(await owner.query(api.agentApi.listRecentEvents, { projectId })).toEqual([
      expect.objectContaining(event),
    ])
  })

  test('revokes agent access without clearing the comment', async () => {
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
    await owner.mutation(api.agentApi.updateComment, {
      projectId,
      comment: 'Keep this instruction.',
    })

    await owner.mutation(api.agentApi.revokeToken, { projectId })
    const revokedStatus = await t.fetch('/status', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(revokedStatus.status).toBe(401)
    expect(await owner.query(api.agentApi.getSettings, { projectId })).toEqual({
      comment: 'Keep this instruction.',
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
