import { describe, expect, test, vi } from 'vitest'

import {
  fetchGitHubAttributionAt,
  fetchVercelAttributionAt,
} from './codeAttribution'

const observedAt = Date.parse('2026-08-08T10:30:00.000Z')

describe('code attribution providers', () => {
  test('resolves the latest main commit at or before the observation with its pull requests', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json([
          {
            sha: '0123456789abcdef0123456789abcdef01234567',
            html_url:
              'https://github.com/acme/app/commit/0123456789abcdef0123456789abcdef01234567',
            commit: {
              message: 'Ship safer cache invalidation\n\nImplementation details',
              committer: { date: '2026-08-08T10:00:00Z' },
            },
            author: { login: 'octocat' },
          },
        ]),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            number: 42,
            title: 'Ship safer cache invalidation',
            html_url: 'https://github.com/acme/app/pull/42',
            merged_at: '2026-08-08T09:55:00Z',
          },
        ]),
      )

    const result = await fetchGitHubAttributionAt({
      repository: 'acme/app',
      observedAt,
      token: 'github-token',
      fetcher,
    })

    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(
      'https://api.github.com/repos/acme/app/commits?sha=main&until=2026-08-08T10%3A30%3A00.000Z&per_page=1',
    )
    expect(fetcher.mock.calls[1]?.[0].toString()).toBe(
      'https://api.github.com/repos/acme/app/commits/0123456789abcdef0123456789abcdef01234567/pulls?per_page=3',
    )
    expect(result).toEqual({
      repository: 'acme/app',
      branch: 'main',
      sha: '0123456789abcdef0123456789abcdef01234567',
      committedAt: Date.parse('2026-08-08T10:00:00Z'),
      message: 'Ship safer cache invalidation',
      authorLogin: 'octocat',
      url: 'https://github.com/acme/app/commit/0123456789abcdef0123456789abcdef01234567',
      pullRequests: [
        {
          number: 42,
          title: 'Ship safer cache invalidation',
          mergedAt: Date.parse('2026-08-08T09:55:00Z'),
          url: 'https://github.com/acme/app/pull/42',
        },
      ],
    })
  })

  test('resolves the latest ready production main deployment activated by the observation', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        deployments: [
          {
            uid: 'dpl_too_late',
            name: 'web',
            url: 'web-too-late.vercel.app',
            state: 'READY',
            target: 'production',
            created: observedAt - 60_000,
            ready: observedAt + 5_000,
            meta: { githubCommitSha: 'too-late' },
          },
          {
            uid: 'dpl_active',
            name: 'web',
            url: 'web-active.vercel.app',
            state: 'READY',
            target: 'production',
            created: observedAt - 120_000,
            ready: observedAt - 30_000,
            meta: {
              githubCommitSha: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
              githubCommitRef: 'main',
            },
          },
        ],
      }),
    )

    const result = await fetchVercelAttributionAt({
      projectId: 'prj_app',
      observedAt,
      token: 'vercel-token',
      fetcher,
    })

    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(
      'https://api.vercel.com/v7/deployments?projectId=prj_app&target=production&state=READY&branch=main&until=1786185000000&limit=20',
    )
    expect(result).toEqual({
      projectId: 'prj_app',
      deploymentId: 'dpl_active',
      name: 'web',
      url: 'https://web-active.vercel.app',
      createdAt: observedAt - 120_000,
      readyAt: observedAt - 30_000,
      commitSha: 'abcdefabcdefabcdefabcdefabcdefabcdefabcd',
      branch: 'main',
    })
  })

  test('rejects malformed provider timestamps instead of returning non-finite values', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({
        deployments: [
          {
            uid: 'dpl_invalid',
            name: 'web',
            url: 'web-invalid.vercel.app',
            state: 'READY',
            target: 'production',
            created: 'not-a-timestamp',
            ready: observedAt - 30_000,
          },
        ],
      }),
    )

    await expect(
      fetchVercelAttributionAt({
        projectId: 'prj_app',
        observedAt,
        token: 'vercel-token',
        fetcher,
      }),
    ).rejects.toThrow('VERCEL_INVALID_RESPONSE')
  })
})
