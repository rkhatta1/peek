import {
  evaluateSnapshot,
  type MonitoringSignal,
  type ProviderSnapshot,
} from '../../../convex/lib/monitoring'
import { formatBytes } from './monitoring-data'

export type CheckTriggerSummary = {
  _id: string
  source: 'connection' | 'manual' | 'scheduled'
  status: 'operational' | 'attention'
  triggeredAt: number
  completedAt: number
  serviceCount: number
  operationalCount: number
  attentionCount: number
  unavailableCount: number
}

export type CheckTriggerEvent = {
  _id: string
  serviceId: string
  serviceName: string
  environment: string
  provider: 'neon' | 'upstash'
  capturedAt: number
  status: 'operational' | 'degraded' | 'unavailable'
  connections: number
  cacheHitRatio: number
  requestCount?: number
  storageBytes?: number
  p99LatencyMs?: number
  deadlocks?: number
  logicalSizeBytes?: number
  queryInsightsEnabled?: boolean
  errorCode?: string
}

type Attribution = {
  observedAt: number
  github: null | {
    connectionId?: string
    errorCode: string | null
    data: null | {
      repository: string
      branch: string
      sha: string
      committedAt: number
      message: string
      authorLogin: string | null
      url: string
      pullRequests: Array<{
        number: number
        title: string
        mergedAt: number | null
        url: string
      }>
    }
  }
  vercel: null | {
    connectionId?: string
    errorCode: string | null
    data: null | {
      projectId: string
      deploymentId: string
      name: string
      url: string
      createdAt: number
      readyAt: number
      commitSha: string | null
      branch: string | null
    }
  }
}

export function evaluateCheckTriggerEvent(event: CheckTriggerEvent) {
  return evaluateSnapshot(toProviderSnapshot(event), {
    now: event.capturedAt,
  })
}

export function buildCheckTriggerEventLogs(event: CheckTriggerEvent) {
  const lines = [
    `snapshot status=${event.status} connections=${event.connections} cache_hit_ratio=${event.cacheHitRatio.toFixed(4)}`,
  ]
  if (event.provider === 'neon') {
    lines.push(
      `neon deadlocks=${event.deadlocks ?? 0} logical_size=${formatBytes(event.logicalSizeBytes)} query_insights=${event.queryInsightsEnabled ?? false}`,
    )
  } else {
    lines.push(
      `upstash requests=${event.requestCount ?? 0} storage=${formatBytes(event.storageBytes)} p99_latency_ms=${event.p99LatencyMs ?? 0}`,
    )
  }
  if (event.errorCode) lines.push(`collector error=${event.errorCode}`)
  return lines
}

export function providerDashboardUrl(provider: CheckTriggerEvent['provider']) {
  return provider === 'neon'
    ? 'https://console.neon.tech/app/projects'
    : 'https://console.upstash.com/redis'
}

export function formatCheckTriggerAsMarkdown({
  attribution,
  events,
  trigger,
  truncated,
}: {
  attribution: Attribution | null
  events: CheckTriggerEvent[]
  trigger: CheckTriggerSummary
  truncated: boolean
}) {
  const lines = [
    `# Peek check run: ${trigger.status === 'operational' ? 'All checks passed' : 'Attention required'}`,
    '',
    `- **Trigger ID:** \`${trigger._id}\``,
    `- **Source:** ${trigger.source}`,
    `- **Status:** ${trigger.status}`,
    `- **Started:** ${formatTimestamp(trigger.triggeredAt)}`,
    `- **Duration:** ${Math.max(0, trigger.completedAt - trigger.triggeredAt)} ms`,
    `- **Outcomes:** ${trigger.operationalCount} operational, ${trigger.attentionCount} attention, ${trigger.unavailableCount} unavailable`,
    '',
    '## Service events',
    '',
  ]

  events.forEach((event, index) => {
    const evaluation = evaluateCheckTriggerEvent(event)
    lines.push(
      `### ${index + 1}. ${event.serviceName}`,
      '',
      `- **Event ID:** \`${event._id}\``,
      `- **Service ID:** \`${event.serviceId}\``,
      `- **Provider:** ${providerLabel(event.provider)}`,
      `- **Environment:** ${event.environment}`,
      `- **Observed:** ${formatTimestamp(event.capturedAt)}`,
      `- **Raw status:** ${event.status}`,
      `- **Evaluated status:** ${evaluation.status}`,
      '',
      '#### Evaluation',
      '',
      ...formatSignals(evaluation.signals),
      '',
      '#### Collector log',
      '',
      '```text',
      ...buildCheckTriggerEventLogs(event),
      '```',
      '',
    )
  })

  if (!events.length) {
    lines.push('No persisted service events were found for this trigger.', '')
  }
  if (truncated) {
    lines.push('> Event list truncated at 100 persisted snapshots.', '')
  }

  lines.push('## Code attribution', '', 'Applies to every service event in this collection run.', '')
  appendGitHubAttribution(lines, attribution)
  appendVercelAttribution(lines, attribution)
  return lines.join('\n').trimEnd()
}

function toProviderSnapshot(event: CheckTriggerEvent): ProviderSnapshot {
  const shared = {
    capturedAt: event.capturedAt,
    status: event.status,
    connections: event.connections,
    cacheHitRatio: event.cacheHitRatio,
  }
  return event.provider === 'neon'
    ? {
        ...shared,
        provider: 'neon',
        deadlocks: event.deadlocks ?? 0,
        logicalSizeBytes: event.logicalSizeBytes ?? 0,
        queryInsightsEnabled: event.queryInsightsEnabled ?? false,
      }
    : {
        ...shared,
        provider: 'upstash',
        requestCount: event.requestCount ?? 0,
        storageBytes: event.storageBytes ?? 0,
        p99LatencyMs: event.p99LatencyMs ?? 0,
      }
}

function formatSignals(signals: MonitoringSignal[]) {
  return signals.length
    ? signals.map(
        (signal) =>
          `- **${signal.severity}: ${signal.title}** (\`${signal.code}\`) — ${signal.detail}`,
      )
    : ['- No threshold violations.']
}

function appendGitHubAttribution(lines: string[], attribution: Attribution | null) {
  lines.push('### GitHub', '')
  const github = attribution?.github
  if (!github) {
    lines.push('Not connected for this project.', '')
    return
  }
  if (!github.data) {
    lines.push(`Unavailable${github.errorCode ? ` (\`${github.errorCode}\`)` : ''}.`, '')
    return
  }
  const data = github.data
  lines.push(
    `- **Repository:** ${data.repository}`,
    `- **Branch:** \`${data.branch}\``,
    `- **Commit:** [\`${data.sha}\` — ${data.message}](${data.url})`,
    `- **Author:** ${data.authorLogin ? `@${data.authorLogin}` : 'Unknown'}`,
    `- **Committed:** ${formatTimestamp(data.committedAt)}`,
  )
  if (data.pullRequests.length) {
    lines.push(
      ...data.pullRequests.map(
        (pullRequest) =>
          `- **PR #${pullRequest.number}:** [${pullRequest.title}](${pullRequest.url})`,
      ),
    )
  } else {
    lines.push('- **Pull requests:** None associated')
  }
  lines.push('')
}

function appendVercelAttribution(lines: string[], attribution: Attribution | null) {
  lines.push('### Vercel', '')
  const vercel = attribution?.vercel
  if (!vercel) {
    lines.push('Not connected for this project.', '')
    return
  }
  if (!vercel.data) {
    lines.push(`Unavailable${vercel.errorCode ? ` (\`${vercel.errorCode}\`)` : ''}.`, '')
    return
  }
  const data = vercel.data
  lines.push(
    `- **Deployment:** [${data.name} (\`${data.deploymentId}\`)](${data.url})`,
    `- **Project ID:** \`${data.projectId}\``,
    `- **Ready:** ${formatTimestamp(data.readyAt)}`,
    `- **Commit:** ${data.commitSha ? `\`${data.commitSha}\`` : 'Unavailable'}`,
    `- **Branch:** ${data.branch ? `\`${data.branch}\`` : 'Unavailable'}`,
    '',
  )
}

function providerLabel(provider: CheckTriggerEvent['provider']) {
  return provider === 'neon' ? 'Neon Postgres' : 'Upstash Redis'
}

function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toISOString()
}
