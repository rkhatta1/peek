import type { ProviderItem } from './monitoring-context'

export type CheckRow = {
  id: string
  provider: 'neon' | 'upstash'
  project: string
  title: string
  detail: string
  severity: 'info' | 'warning' | 'critical'
  observedAt?: number
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
  if (item.connection.mode === 'demo') return 'Demo'
  return item.evaluation?.status === 'operational' ? 'Operational' : 'Attention'
}

export function buildCheckRows(providers: ProviderItem[]): CheckRow[] {
  return providers.flatMap((item) => {
    const signals = item.evaluation?.signals ?? []
    if (signals.length) {
      return signals.map((signal, index) => ({
        id: `${item.connection._id}-${index}`,
        provider: item.connection.provider,
        project: item.connection.name,
        title: signal.title,
        detail: signal.detail,
        severity: signal.severity,
        observedAt: item.latest?.capturedAt,
      }))
    }

    return [
      {
        id: `${item.connection._id}-ready`,
        provider: item.connection.provider,
        project: item.connection.name,
        title:
          item.connection.mode === 'demo'
            ? 'Demo connection ready'
            : 'All checks passed',
        detail:
          item.connection.mode === 'demo'
            ? 'Add provider credentials in Convex to begin live collection.'
            : 'No threshold violations in the latest snapshot.',
        severity: 'info' as const,
        observedAt: item.latest?.capturedAt,
      },
    ]
  })
}
