import { describe, expect, it } from 'vitest'

import {
  evaluateSnapshot,
  normalizeNeonPostgresStats,
  normalizeUpstashStats,
} from './monitoring'

describe('monitoring provider normalization', () => {
  it('normalizes Neon counters into stable operational evidence', () => {
    const snapshot = normalizeNeonPostgresStats({
      capturedAt: 1_786_003_200_000,
      stats: {
        numbackends: 1,
        xact_commit: '377',
        xact_rollback: '2',
        blks_read: '1526',
        blks_hit: '41929',
        deadlocks: '0',
        temp_bytes: '0',
      },
      logicalSizeBytes: 30_908_416,
      queryInsightsEnabled: false,
    })

    expect(snapshot).toMatchObject({
      provider: 'neon',
      capturedAt: 1_786_003_200_000,
      status: 'operational',
      connections: 1,
      cacheHitRatio: 0.9649,
      deadlocks: 0,
      logicalSizeBytes: 30_908_416,
      queryInsightsEnabled: false,
    })
  })

  it('uses the newest Upstash samples and preserves p99 latency', () => {
    const snapshot = normalizeUpstashStats({
      capturedAt: 1_786_003_200_000,
      stats: {
        daily_net_commands: 17,
        current_storage: 73,
        connection_count: [
          { x: '2026-08-06 09:30:00 +0000 UTC', y: 0 },
          { x: '2026-08-06 09:40:00 +0000 UTC', y: 2 },
        ],
        latency_99: [
          { x: '2026-08-06 09:30:00 +0000 UTC', y: 0.7 },
          { x: '2026-08-06 09:40:00 +0000 UTC', y: 1.4 },
        ],
        hits: [{ x: '2026-08-06 09:40:00 +0000 UTC', y: 9 }],
        misses: [{ x: '2026-08-06 09:40:00 +0000 UTC', y: 1 }],
      },
    })

    expect(snapshot).toMatchObject({
      provider: 'upstash',
      status: 'operational',
      requestCount: 17,
      storageBytes: 73,
      connections: 2,
      p99LatencyMs: 1.4,
      cacheHitRatio: 0.9,
    })
  })
})

describe('monitoring threshold evaluation', () => {
  it('surfaces missing query insights without marking Neon unavailable', () => {
    const result = evaluateSnapshot(
      {
        provider: 'neon',
        capturedAt: 1_786_003_200_000,
        status: 'operational',
        connections: 1,
        deadlocks: 0,
        cacheHitRatio: 0.97,
        logicalSizeBytes: 30_908_416,
        queryInsightsEnabled: false,
      },
      { now: 1_786_003_200_000 },
    )

    expect(result.status).toBe('attention')
    expect(result.signals).toContainEqual(
      expect.objectContaining({
        code: 'neon_query_insights_disabled',
        severity: 'warning',
      }),
    )
  })

  it('marks an old provider snapshot as stale', () => {
    const result = evaluateSnapshot(
      {
        provider: 'upstash',
        capturedAt: 1_786_000_000_000,
        status: 'operational',
        requestCount: 17,
        storageBytes: 73,
        connections: 0,
        p99LatencyMs: 1.4,
        cacheHitRatio: 0.9,
      },
      { now: 1_786_003_200_000, staleAfterMs: 20 * 60 * 1000 },
    )

    expect(result.status).toBe('stale')
    expect(result.signals).toContainEqual(
      expect.objectContaining({ code: 'snapshot_stale', severity: 'warning' }),
    )
  })
})
