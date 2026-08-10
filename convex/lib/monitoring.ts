export type Provider = 'neon' | 'upstash'
export type RawProviderStatus = 'operational' | 'degraded' | 'unavailable'
export type EvaluatedStatus =
  | 'operational'
  | 'attention'
  | 'critical'
  | 'stale'
  | 'unavailable'
export type SignalSeverity = 'info' | 'warning' | 'critical'

type NeonSnapshot = {
  provider: 'neon'
  capturedAt: number
  status: RawProviderStatus
  connections: number
  cacheHitRatio: number
  deadlocks: number
  logicalSizeBytes: number
  queryInsightsEnabled: boolean
}

type UpstashSnapshot = {
  provider: 'upstash'
  capturedAt: number
  status: RawProviderStatus
  requestCount: number
  storageBytes: number
  connections: number
  p99LatencyMs: number
  cacheHitRatio: number
}

export type ProviderSnapshot = NeonSnapshot | UpstashSnapshot

export type MonitoringSignal = {
  code: string
  severity: SignalSeverity
  title: string
  detail: string
}

const MINUTE_MS = 60 * 1000
const COLLECTION_FRESHNESS_GRACE_MINUTES = 5

export function collectionFreshnessLimitMs(intervalMinutes: number) {
  return (intervalMinutes + COLLECTION_FRESHNESS_GRACE_MINUTES) * MINUTE_MS
}

type NeonStatsInput = {
  capturedAt: number
  stats: {
    numbackends: number | string
    xact_commit: number | string
    xact_rollback: number | string
    blks_read: number | string
    blks_hit: number | string
    deadlocks: number | string
    temp_bytes: number | string
  }
  logicalSizeBytes: number
  queryInsightsEnabled: boolean
}

type Sample = { x: string; y: number }

type UpstashStatsInput = {
  capturedAt: number
  stats: {
    daily_net_commands: number
    current_storage: number
    connection_count: Sample[]
    latency_99: Sample[]
    hits: Sample[]
    misses: Sample[]
  }
}

function numberFrom(value: number | string) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function latestValue(samples: Sample[]) {
  return samples[samples.length - 1]?.y ?? 0
}

function ratio(numerator: number, denominator: number) {
  if (denominator <= 0) return 0
  return Number((numerator / denominator).toFixed(4))
}

export function normalizeNeonPostgresStats({
  capturedAt,
  stats,
  logicalSizeBytes,
  queryInsightsEnabled,
}: NeonStatsInput): NeonSnapshot {
  const blocksRead = numberFrom(stats.blks_read)
  const blocksHit = numberFrom(stats.blks_hit)

  return {
    provider: 'neon',
    capturedAt,
    status: 'operational',
    connections: numberFrom(stats.numbackends),
    cacheHitRatio: ratio(blocksHit, blocksHit + blocksRead),
    deadlocks: numberFrom(stats.deadlocks),
    logicalSizeBytes,
    queryInsightsEnabled,
  }
}

export function normalizeUpstashStats({
  capturedAt,
  stats,
}: UpstashStatsInput): UpstashSnapshot {
  const hits = latestValue(stats.hits)
  const misses = latestValue(stats.misses)

  return {
    provider: 'upstash',
    capturedAt,
    status: 'operational',
    requestCount: stats.daily_net_commands,
    storageBytes: stats.current_storage,
    connections: latestValue(stats.connection_count),
    p99LatencyMs: latestValue(stats.latency_99),
    cacheHitRatio: ratio(hits, hits + misses),
  }
}

export function evaluateSnapshot(
  snapshot: ProviderSnapshot,
  options: { now?: number; staleAfterMs?: number } = {},
) {
  const now = options.now ?? Date.now()
  const staleAfterMs = options.staleAfterMs ?? collectionFreshnessLimitMs(15)
  const signals: MonitoringSignal[] = []

  if (now - snapshot.capturedAt > staleAfterMs) {
    signals.push({
      code: 'snapshot_stale',
      severity: 'warning',
      title: 'Collection is stale',
      detail: 'The latest provider snapshot is older than the freshness limit.',
    })
  }

  if (snapshot.status === 'unavailable') {
    signals.push({
      code: 'provider_unavailable',
      severity: 'critical',
      title: 'Provider unavailable',
      detail: 'The provider did not return a usable monitoring snapshot.',
    })
  }

  if (snapshot.provider === 'neon') {
    if (!snapshot.queryInsightsEnabled) {
      signals.push({
        code: 'neon_query_insights_disabled',
        severity: 'warning',
        title: 'Query insights unavailable',
        detail:
          'Enable pg_stat_statements to inspect slow query fingerprints.',
      })
    }
    if (snapshot.deadlocks > 0) {
      signals.push({
        code: 'neon_deadlocks_detected',
        severity: 'critical',
        title: 'Database deadlocks detected',
        detail: 'At least one transaction deadlock occurred in this stats window.',
      })
    }
  }

  if (snapshot.provider === 'upstash') {
    if (snapshot.p99LatencyMs >= 100) {
      signals.push({
        code: 'upstash_p99_latency_critical',
        severity: 'critical',
        title: 'Redis p99 latency is critical',
        detail: 'The latest p99 latency sample is at least 100 ms.',
      })
    } else if (snapshot.p99LatencyMs >= 50) {
      signals.push({
        code: 'upstash_p99_latency_high',
        severity: 'warning',
        title: 'Redis p99 latency is elevated',
        detail: 'The latest p99 latency sample is at least 50 ms.',
      })
    }
  }

  const hasCritical = signals.some((signal) => signal.severity === 'critical')
  const isStale = signals.some((signal) => signal.code === 'snapshot_stale')

  const status: EvaluatedStatus =
    snapshot.status === 'unavailable'
      ? 'unavailable'
      : hasCritical
        ? 'critical'
        : isStale
          ? 'stale'
          : signals.length > 0
            ? 'attention'
            : 'operational'

  return { status, signals }
}
