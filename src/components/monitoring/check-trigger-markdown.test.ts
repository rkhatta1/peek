import { describe, expect, test } from 'vitest'

import { formatCheckTriggerAsMarkdown } from './check-trigger-markdown'

describe('formatCheckTriggerAsMarkdown', () => {
  test('includes every service event, collector log, and code attribution', () => {
    const markdown = formatCheckTriggerAsMarkdown({
      trigger: {
        _id: 'trigger-1',
        source: 'manual',
        status: 'attention',
        triggeredAt: 1_786_000_000_000,
        completedAt: 1_786_000_000_250,
        serviceCount: 2,
        operationalCount: 1,
        attentionCount: 1,
        unavailableCount: 0,
      },
      events: [
        {
          _id: 'snapshot-1',
          serviceId: 'service-1',
          serviceName: 'Primary database',
          environment: 'Production',
          provider: 'neon',
          capturedAt: 1_786_000_000_100,
          status: 'operational',
          connections: 8,
          cacheHitRatio: 0.99,
          deadlocks: 0,
          logicalSizeBytes: 4_096,
          queryInsightsEnabled: true,
        },
        {
          _id: 'snapshot-2',
          serviceId: 'service-2',
          serviceName: 'Primary cache',
          environment: 'Production',
          provider: 'upstash',
          capturedAt: 1_786_000_000_200,
          status: 'operational',
          connections: 3,
          cacheHitRatio: 0.91,
          requestCount: 1_200,
          storageBytes: 8_192,
          p99LatencyMs: 120,
        },
      ],
      attribution: {
        observedAt: 1_786_000_000_200,
        github: {
          connectionId: 'github-1',
          errorCode: null,
          data: {
            repository: 'acme/peek',
            branch: 'main',
            sha: 'abcdef123456',
            committedAt: 1_785_999_000_000,
            message: 'Ship monitoring drawer',
            authorLogin: 'octocat',
            url: 'https://github.com/acme/peek/commit/abcdef123456',
            pullRequests: [
              {
                number: 42,
                title: 'Restore event details',
                mergedAt: 1_785_999_100_000,
                url: 'https://github.com/acme/peek/pull/42',
              },
            ],
          },
        },
        vercel: {
          connectionId: 'vercel-1',
          errorCode: null,
          data: {
            projectId: 'peek',
            deploymentId: 'dpl_123',
            name: 'peek',
            url: 'https://peek.vercel.app',
            createdAt: 1_785_999_200_000,
            readyAt: 1_785_999_300_000,
            commitSha: 'abcdef123456',
            branch: 'main',
          },
        },
      },
      truncated: false,
    })

    expect(markdown).toContain('Primary database')
    expect(markdown).toContain('Primary cache')
    expect(markdown).toContain('neon deadlocks=0')
    expect(markdown).toContain('upstash requests=1200')
    expect(markdown).toContain('acme/peek')
    expect(markdown).toContain('abcdef123456')
    expect(markdown).toContain('PR #42')
    expect(markdown).toContain('dpl_123')
  })
})
