import { describe, expect, test, vi } from 'vitest'

import {
  fetchGitHubAttributionAt,
  fetchGitHubBranches,
  fetchGitHubMainCommitsPage,
  fetchVercelAttributionAt,
  isGitHubCommitAncestor,
  validateGitHubRepository,
} from './codeAttribution'

const observedAt = Date.parse('2026-08-08T10:30:00.000Z')

describe('code attribution providers', () => {
  test('aborts GitHub requests after the provider timeout', async () => {
    vi.useFakeTimers()
    try {
      const signals: AbortSignal[] = []
      const fetcher = vi.fn<typeof fetch>((_url, init) => {
        if (init?.signal) signals.push(init.signal)
        return new Promise<Response>(() => {})
      })

      void fetchGitHubMainCommitsPage({
        repository: 'acme/app',
        token: 'github-token',
        page: 1,
        fetcher,
      })
      expect(signals).toHaveLength(1)
      await vi.advanceTimersByTimeAsync(15_000)
      expect(signals[0]?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  test('bounds provider-controlled commit display fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json([
        {
          sha: '0123456789abcdef0123456789abcdef01234567',
          html_url:
            'https://github.com/acme/app/commit/0123456789abcdef0123456789abcdef01234567',
          commit: {
            message: 'T'.repeat(1_000),
            committer: {
              date: '2026-08-08T10:00:00Z',
              name: 'A'.repeat(400),
            },
          },
        },
      ]),
    )

    const [commit] = await fetchGitHubMainCommitsPage({
      repository: 'acme/app',
      token: 'github-token',
      page: 1,
      fetcher,
    })
    expect(commit.title).toHaveLength(500)
    expect(commit.author).toHaveLength(200)
  })

  test('fetches commits from the selected GitHub branch', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json([]))

    await fetchGitHubMainCommitsPage({
      repository: 'acme/app',
      branch: 'release/2026',
      token: 'github-token',
      page: 1,
      fetcher,
    })

    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(
      'https://api.github.com/repos/acme/app/commits?sha=release%2F2026&per_page=100&page=1',
    )
  })

  test('validates and stores the selected GitHub branch', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          id: 123,
          full_name: 'acme/app',
          name: 'app',
          default_branch: 'main',
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ name: 'release/2026' }),
      )

    await expect(
      validateGitHubRepository({
        repository: 'acme/app',
        branch: 'release/2026',
        token: 'github-token',
        fetcher,
      }),
    ).resolves.toEqual({
      externalId: '123',
      externalSlug: 'acme/app',
      name: 'acme/app',
      branch: 'release/2026',
    })
    expect(fetcher.mock.calls[1]?.[0].toString()).toBe(
      'https://api.github.com/repos/acme/app/branches/release%2F2026',
    )
  })

  test('lists bounded GitHub branch names for the connection picker', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json([{ name: 'main' }, { name: 'release/2026' }]),
    )

    await expect(
      fetchGitHubBranches({
        repository: 'acme/app',
        token: 'github-token',
        fetcher,
      }),
    ).resolves.toEqual(['main', 'release/2026'])
    expect(fetcher.mock.calls[0]?.[0].toString()).toBe(
      'https://api.github.com/repos/acme/app/branches?per_page=100',
    )
  })

  test('paginates GitHub branches instead of silently omitting later names', async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      name: `branch-${index}`,
    }))
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(firstPage))
      .mockResolvedValueOnce(Response.json([{ name: 'branch-100' }]))

    const branches = await fetchGitHubBranches({
      repository: 'acme/app',
      token: 'github-token',
      fetcher,
    })

    expect(branches).toHaveLength(101)
    expect(branches.at(-1)).toBe('branch-100')
    expect(fetcher.mock.calls[1]?.[0].toString()).toBe(
      'https://api.github.com/repos/acme/app/branches?per_page=100&page=2',
    )
  })

  test('detects whether the previously synced head remains on main', async () => {
    const ancestorFetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({ status: 'ahead' }),
    )
    const divergedFetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(
      Response.json({ status: 'diverged' }),
    )

    await expect(
      isGitHubCommitAncestor({
        repository: 'acme/app',
        base: '0123456789abcdef0123456789abcdef01234567',
        head: '89abcdef0123456789abcdef0123456789abcdef',
        token: 'github-token',
        fetcher: ancestorFetcher,
      }),
    ).resolves.toBe(true)
    await expect(
      isGitHubCommitAncestor({
        repository: 'acme/app',
        base: '0123456789abcdef0123456789abcdef01234567',
        head: '89abcdef0123456789abcdef0123456789abcdef',
        token: 'github-token',
        fetcher: divergedFetcher,
      }),
    ).resolves.toBe(false)
    expect(ancestorFetcher.mock.calls[0]?.[0].toString()).toBe(
      'https://api.github.com/repos/acme/app/compare/0123456789abcdef0123456789abcdef01234567...89abcdef0123456789abcdef0123456789abcdef',
    )
  })

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
