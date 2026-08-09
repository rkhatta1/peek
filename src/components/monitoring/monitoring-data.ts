import type { ProviderItem } from './monitoring-context'

export type CheckRow = {
  id: string
  provider: 'neon' | 'upstash'
  service: string
  environment: string
  code: string
  title: string
  detail: string
  severity: 'info' | 'warning' | 'critical'
  observedAt?: number
  dashboardUrl: string
  logs: string[]
}

export function formatBytes(value = 0) {
  const formatter = new Intl.NumberFormat('en', { maximumFractionDigits: 1 })
  if (value < 1024) return `${formatter.format(value)} B`
  if (value < 1024 ** 2) return `${formatter.format(value / 1024)} KB`
  if (value < 1024 ** 3) return `${formatter.format(value / 1024 ** 2)} MB`
  return `${formatter.format(value / 1024 ** 3)} GB`
}

export function formatTime(value?: number) {
  if (!value) return 'Not collected'
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

export function formatDateTime(value?: number) {
  if (!value) return 'Not collected'
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value)
}

export function statusLabel(item: ProviderItem) {
  if (!item.connection.active) return 'Paused'
  if (item.connection.credentialState === 'error') return 'Credentials'
  if (!item.latest) return 'Pending'
  return item.evaluation?.status === 'operational' ? 'Operational' : 'Attention'
}

export function buildCheckRows(providers: ProviderItem[]): CheckRow[] {
  return providers.flatMap((item) => {
    const signals = item.evaluation?.signals ?? []
    if (signals.length) {
      return signals.map((signal, index) => ({
        id: `${item.connection._id}-${index}`,
        provider: item.connection.provider,
        service: item.connection.name,
        environment: item.connection.environment,
        code: signal.code,
        title: signal.title,
        detail: signal.detail,
        severity: signal.severity,
        observedAt: item.latest?.capturedAt,
        dashboardUrl: providerDashboardUrl(item.connection.provider),
        logs: buildRelatedLogs(item),
      }))
    }

    const isCollected = Boolean(item.latest)
    return [
      {
        id: `${item.connection._id}-ready`,
        provider: item.connection.provider,
        service: item.connection.name,
        environment: item.connection.environment,
        code: isCollected ? 'all_checks_passed' : 'awaiting_first_sample',
        title: isCollected ? 'All checks passed' : 'Awaiting first sample',
        detail: isCollected
          ? 'No threshold violations in the latest snapshot.'
          : 'Collection will begin on the next scheduled run.',
        severity: 'info' as const,
        observedAt: item.latest?.capturedAt,
        dashboardUrl: providerDashboardUrl(item.connection.provider),
        logs: buildRelatedLogs(item),
      },
    ]
  })
}

export function formatCheckAsMarkdown(row: CheckRow) {
  const provider = row.provider === 'neon' ? 'Neon Postgres' : 'Upstash Redis'
  return [
    `# Peek check: ${row.title}`,
    '',
    `- **Event ID:** \`${row.id}\``,
    `- **Code:** \`${row.code}\``,
    `- **Severity:** ${row.severity}`,
    `- **Service:** ${row.service}`,
    `- **Provider:** ${provider}`,
    `- **Environment:** ${row.environment}`,
    `- **Observed:** ${formatDateTime(row.observedAt)}`,
    '',
    '## Attention reason',
    '',
    row.detail,
    '',
    '## Related collector logs',
    '',
    '```text',
    ...row.logs,
    '```',
  ].join('\n')
}

function providerDashboardUrl(provider: 'neon' | 'upstash') {
  return provider === 'neon'
    ? 'https://console.neon.tech/app/projects'
    : 'https://console.upstash.com/redis'
}

function buildRelatedLogs(item: ProviderItem) {
  const snapshot = item.latest
  if (!snapshot) {
    return [
      `collector state=pending active=${item.connection.active} credentials=${item.connection.credentialState}`,
    ]
  }

  const lines = [
    `snapshot status=${snapshot.status} connections=${snapshot.connections} cache_hit_ratio=${snapshot.cacheHitRatio.toFixed(4)}`,
  ]
  if (snapshot.provider === 'neon') {
    lines.push(
      `neon deadlocks=${snapshot.deadlocks ?? 0} logical_size=${formatBytes(snapshot.logicalSizeBytes)} query_insights=${snapshot.queryInsightsEnabled ?? false}`,
    )
  } else {
    lines.push(
      `upstash requests=${snapshot.requestCount ?? 0} storage=${formatBytes(snapshot.storageBytes)} p99_latency_ms=${snapshot.p99LatencyMs ?? 0}`,
    )
  }
  if (snapshot.errorCode ?? item.connection.lastErrorCode) {
    lines.push(
      `collector error=${snapshot.errorCode ?? item.connection.lastErrorCode}`,
    )
  }
  return lines
}
