import { neon } from '@neondatabase/serverless'

import {
  normalizeNeonPostgresStats,
  normalizeUpstashStats,
  type ProviderSnapshot,
} from './monitoring'
import type { ProviderCredentials } from './secrets'

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export function normalizeProviderCredentials(
  credentials: ProviderCredentials,
): ProviderCredentials {
  if (credentials.provider === 'neon') {
    const databaseUrl = required(credentials.databaseUrl, 'Neon connection string')
    let parsed: URL
    try {
      parsed = new URL(databaseUrl)
    } catch {
      throw new Error('Neon connection string is invalid')
    }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
      throw new Error('Neon connection string must use PostgreSQL')
    }
    if (!parsed.hostname.endsWith('.neon.tech') || !parsed.username || !parsed.password) {
      throw new Error('Neon connection string must contain Neon host credentials')
    }
    if (parsed.searchParams.get('sslmode') === 'disable') {
      throw new Error('Neon connection string must keep SSL enabled')
    }
    return { provider: 'neon', databaseUrl }
  }

  return {
    provider: 'upstash',
    email: required(credentials.email, 'Upstash email'),
    apiKey: required(credentials.apiKey, 'Upstash API key'),
    databaseId: required(credentials.databaseId, 'Upstash database ID'),
  }
}

function encodeBasicAuth(username: string, password: string) {
  const bytes = new TextEncoder().encode(`${username}:${password}`)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function collectNeon(databaseUrl: string) {
  const sql = neon(databaseUrl)
  const [stats] = await sql`
    SELECT
      numbackends,
      xact_commit,
      xact_rollback,
      blks_read,
      blks_hit,
      deadlocks,
      temp_bytes,
      pg_database_size(current_database()) AS logical_size_bytes,
      EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pg_stat_statements'
      ) AS query_insights_enabled
    FROM pg_stat_database
    WHERE datname = current_database()
  `
  if (!stats) throw new Error('NEON_EMPTY_STATS')
  return normalizeNeonPostgresStats({
    capturedAt: Date.now(),
    stats: {
      numbackends: stats.numbackends,
      xact_commit: stats.xact_commit,
      xact_rollback: stats.xact_rollback,
      blks_read: stats.blks_read,
      blks_hit: stats.blks_hit,
      deadlocks: stats.deadlocks,
      temp_bytes: stats.temp_bytes,
    },
    logicalSizeBytes: Number(stats.logical_size_bytes),
    queryInsightsEnabled: Boolean(stats.query_insights_enabled),
  })
}

async function collectUpstash(credentials: Extract<ProviderCredentials, { provider: 'upstash' }>) {
  const response = await fetch(
    `https://api.upstash.com/v2/redis/stats/${encodeURIComponent(credentials.databaseId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${encodeBasicAuth(credentials.email, credentials.apiKey)}`,
      },
      signal: AbortSignal.timeout(15_000),
    },
  )
  if (!response.ok) throw new Error(`UPSTASH_HTTP_${response.status}`)
  return normalizeUpstashStats({ capturedAt: Date.now(), stats: await response.json() })
}

export async function collectProvider(credentials: ProviderCredentials) {
  const normalized = normalizeProviderCredentials(credentials)
  return normalized.provider === 'neon'
    ? await collectNeon(normalized.databaseUrl)
    : await collectUpstash(normalized)
}

export function providerErrorCode(error: unknown) {
  const message = error instanceof Error ? error.message.toLocaleLowerCase('en-US') : ''
  if (
    message.includes('upstash_http_401') ||
    message.includes('upstash_http_403') ||
    message.includes('password authentication failed') ||
    message.includes('authentication failed')
  ) {
    return 'CREDENTIAL_REJECTED'
  }
  if (message.includes('timeout') || message.includes('timed out')) return 'PROVIDER_TIMEOUT'
  if (message.includes('connection string') || message.includes('ssl')) {
    return 'INVALID_CONFIGURATION'
  }
  return 'COLLECTION_FAILED'
}

export function unavailableSnapshot(provider: 'neon' | 'upstash'): ProviderSnapshot {
  const shared = {
    capturedAt: Date.now(),
    status: 'unavailable' as const,
    connections: 0,
    cacheHitRatio: 0,
  }
  return provider === 'neon'
    ? {
        ...shared,
        provider,
        deadlocks: 0,
        logicalSizeBytes: 0,
        queryInsightsEnabled: false,
      }
    : {
        ...shared,
        provider,
        requestCount: 0,
        storageBytes: 0,
        p99LatencyMs: 0,
      }
}
