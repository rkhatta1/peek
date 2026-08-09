type Fetcher = typeof fetch

type GitHubCommitResponse = {
  sha?: unknown
  html_url?: unknown
  commit?: {
    message?: unknown
    committer?: { date?: unknown; name?: unknown } | null
  } | null
  author?: { login?: unknown } | null
}

type GitHubPullRequestResponse = {
  number?: unknown
  title?: unknown
  html_url?: unknown
  merged_at?: unknown
}

type VercelDeploymentResponse = {
  uid?: unknown
  name?: unknown
  url?: unknown
  state?: unknown
  target?: unknown
  created?: unknown
  createdAt?: unknown
  ready?: unknown
  meta?: unknown
}

export type GitHubAttribution = {
  repository: string
  branch: 'main'
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

export type GitHubMainCommit = {
  sha: string
  title: string
  author: string
  committedAt: number
  url: string
}

export type VercelAttribution = {
  projectId: string
  deploymentId: string
  name: string
  url: string
  createdAt: number
  readyAt: number
  commitSha: string | null
  branch: string | null
}

export type ValidatedCodeConnection = {
  externalId: string
  externalSlug: string
  name: string
}

export async function validateGitHubRepository({
  repository,
  token,
  fetcher = fetch,
}: {
  repository: string
  token: string
  fetcher?: Fetcher
}): Promise<ValidatedCodeConnection> {
  const normalizedRepository = normalizeGitHubRepository(repository)
  const url = new URL(
    `https://api.github.com/repos/${encodeRepository(normalizedRepository)}`,
  )
  const response = await fetchJson<{
    id?: unknown
    full_name?: unknown
    name?: unknown
  }>(fetcher, url, githubHeaders(token), 'GITHUB')
  const fullName = requiredString(response.full_name, 'GITHUB_INVALID_RESPONSE')
  return {
    externalId: String(requiredNumber(response.id, 'GITHUB_INVALID_RESPONSE')),
    externalSlug: fullName,
    name: fullName,
  }
}

export async function validateVercelProject({
  projectId,
  token,
  fetcher = fetch,
}: {
  projectId: string
  token: string
  fetcher?: Fetcher
}): Promise<ValidatedCodeConnection> {
  const normalizedProjectId = normalizeExternalId(projectId, 'Vercel project')
  const url = new URL(
    `https://api.vercel.com/v9/projects/${encodeURIComponent(normalizedProjectId)}`,
  )
  const response = await fetchJson<{ id?: unknown; name?: unknown }>(
    fetcher,
    url,
    { Authorization: `Bearer ${token}` },
    'VERCEL',
  )
  const id = requiredString(response.id, 'VERCEL_INVALID_RESPONSE')
  const name = requiredString(response.name, 'VERCEL_INVALID_RESPONSE')
  return { externalId: id, externalSlug: name, name }
}

export async function fetchGitHubAttributionAt({
  repository,
  observedAt,
  token,
  fetcher = fetch,
}: {
  repository: string
  observedAt: number
  token: string
  fetcher?: Fetcher
}): Promise<GitHubAttribution | null> {
  const commitsUrl = new URL(
    `https://api.github.com/repos/${encodeRepository(repository)}/commits`,
  )
  commitsUrl.searchParams.set('sha', 'main')
  commitsUrl.searchParams.set('until', new Date(observedAt).toISOString())
  commitsUrl.searchParams.set('per_page', '1')

  const commits = await fetchJson<GitHubCommitResponse[]>(
    fetcher,
    commitsUrl,
    githubHeaders(token),
    'GITHUB',
  )
  const commit = commits[0]
  if (!commit) return null

  const sha = requiredString(commit.sha, 'GITHUB_INVALID_RESPONSE')
  const committedAt = requiredDate(
    commit.commit?.committer?.date,
    'GITHUB_INVALID_RESPONSE',
  )
  const pullRequestsUrl = new URL(
    `https://api.github.com/repos/${encodeRepository(repository)}/commits/${encodeURIComponent(sha)}/pulls`,
  )
  pullRequestsUrl.searchParams.set('per_page', '3')
  const pullRequests = await fetchJson<GitHubPullRequestResponse[]>(
    fetcher,
    pullRequestsUrl,
    githubHeaders(token),
    'GITHUB',
  )

  return {
    repository,
    branch: 'main',
    sha,
    committedAt,
    message: requiredString(commit.commit?.message, 'GITHUB_INVALID_RESPONSE').split(
      '\n',
      1,
    )[0],
    authorLogin: optionalString(commit.author?.login),
    url: requiredString(commit.html_url, 'GITHUB_INVALID_RESPONSE'),
    pullRequests: pullRequests.map((pullRequest) => ({
      number: requiredNumber(pullRequest.number, 'GITHUB_INVALID_RESPONSE'),
      title: requiredString(pullRequest.title, 'GITHUB_INVALID_RESPONSE'),
      mergedAt: optionalDate(pullRequest.merged_at),
      url: requiredString(pullRequest.html_url, 'GITHUB_INVALID_RESPONSE'),
    })),
  }
}

export async function fetchGitHubMainCommitsPage({
  repository,
  token,
  page,
  perPage = 100,
  fetcher = fetch,
}: {
  repository: string
  token: string
  page: number
  perPage?: number
  fetcher?: Fetcher
}): Promise<GitHubMainCommit[]> {
  if (!Number.isSafeInteger(page) || page < 1 || perPage < 1 || perPage > 100) {
    throw new Error('INVALID_GITHUB_PAGE')
  }
  const url = new URL(
    `https://api.github.com/repos/${encodeRepository(repository)}/commits`,
  )
  url.searchParams.set('sha', 'main')
  url.searchParams.set('per_page', String(perPage))
  url.searchParams.set('page', String(page))
  const commits = await fetchJson<GitHubCommitResponse[]>(
    fetcher,
    url,
    githubHeaders(token),
    'GITHUB',
  )
  return commits.map((commit) => ({
    sha: requiredString(commit.sha, 'GITHUB_INVALID_RESPONSE'),
    title: boundedDisplay(
      requiredString(commit.commit?.message, 'GITHUB_INVALID_RESPONSE').split(
        '\n',
        1,
      )[0],
      500,
      'Untitled commit',
    ),
    author: boundedDisplay(
      optionalString(commit.author?.login) ??
        optionalString(commit.commit?.committer?.name) ??
        'Unknown',
      200,
      'Unknown',
    ),
    committedAt: requiredDate(
      commit.commit?.committer?.date,
      'GITHUB_INVALID_RESPONSE',
    ),
    url: requiredString(commit.html_url, 'GITHUB_INVALID_RESPONSE'),
  }))
}

export async function isGitHubCommitAncestor({
  repository,
  base,
  head,
  token,
  fetcher = fetch,
}: {
  repository: string
  base: string
  head: string
  token: string
  fetcher?: Fetcher
}) {
  const url = new URL(
    `https://api.github.com/repos/${encodeRepository(repository)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
  )
  const response = await fetcher(url, { headers: githubHeaders(token) })
  if (response.status === 404) return false
  if (!response.ok) throw new Error(`GITHUB_HTTP_${response.status}`)
  const comparison = (await response.json()) as { status?: unknown }
  return comparison.status === 'ahead' || comparison.status === 'identical'
}

export async function fetchVercelAttributionAt({
  projectId,
  observedAt,
  token,
  fetcher = fetch,
}: {
  projectId: string
  observedAt: number
  token: string
  fetcher?: Fetcher
}): Promise<VercelAttribution | null> {
  const deploymentsUrl = new URL('https://api.vercel.com/v7/deployments')
  deploymentsUrl.searchParams.set('projectId', projectId)
  deploymentsUrl.searchParams.set('target', 'production')
  deploymentsUrl.searchParams.set('state', 'READY')
  deploymentsUrl.searchParams.set('branch', 'main')
  deploymentsUrl.searchParams.set('until', String(observedAt))
  deploymentsUrl.searchParams.set('limit', '20')
  const response = await fetchJson<{ deployments?: VercelDeploymentResponse[] }>(
    fetcher,
    deploymentsUrl,
    { Authorization: `Bearer ${token}` },
    'VERCEL',
  )
  const deployment = (response.deployments ?? [])
    .filter(
      (candidate) =>
        candidate.state === 'READY' &&
        candidate.target === 'production' &&
        timestamp(candidate.ready) <= observedAt,
    )
    .sort((left, right) => timestamp(right.ready) - timestamp(left.ready))[0]
  if (!deployment) return null

  const meta = record(deployment.meta)
  const deploymentUrl = requiredString(deployment.url, 'VERCEL_INVALID_RESPONSE')
  return {
    projectId,
    deploymentId: requiredString(deployment.uid, 'VERCEL_INVALID_RESPONSE'),
    name: requiredString(deployment.name, 'VERCEL_INVALID_RESPONSE'),
    url: deploymentUrl.startsWith('http')
      ? deploymentUrl
      : `https://${deploymentUrl}`,
    createdAt: requiredTimestamp(
      deployment.createdAt ?? deployment.created,
      'VERCEL_INVALID_RESPONSE',
    ),
    readyAt: requiredTimestamp(deployment.ready, 'VERCEL_INVALID_RESPONSE'),
    commitSha: optionalString(meta?.githubCommitSha),
    branch: optionalString(meta?.githubCommitRef),
  }
}

async function fetchJson<T>(
  fetcher: Fetcher,
  url: URL,
  headers: HeadersInit,
  provider: 'GITHUB' | 'VERCEL',
): Promise<T> {
  const response = await fetcher(url, { headers })
  if (!response.ok) throw new Error(`${provider}_HTTP_${response.status}`)
  return (await response.json()) as T
}

function githubHeaders(token: string): HeadersInit {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2026-03-10',
  }
}

function encodeRepository(repository: string) {
  return repository.split('/').map(encodeURIComponent).join('/')
}

function normalizeGitHubRepository(value: string) {
  const repository = value.trim().replace(/^https:\/\/github\.com\//i, '').replace(/\.git$/i, '')
  const parts = repository.split('/')
  if (
    parts.length !== 2 ||
    parts.some((part) => !part || !/^[A-Za-z0-9_.-]+$/.test(part))
  ) {
    throw new Error('INVALID_GITHUB_REPOSITORY')
  }
  return repository
}

function normalizeExternalId(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized || normalized.length > 160) {
    throw new Error(`INVALID_${label.toUpperCase().replaceAll(' ', '_')}`)
  }
  return normalized
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : null
}

function requiredString(value: unknown, code: string) {
  if (typeof value !== 'string' || !value) throw new Error(code)
  return value
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : null
}

function boundedDisplay(value: string, maxLength: number, fallback: string) {
  return value.trim().slice(0, maxLength) || fallback
}

function requiredNumber(value: unknown, code: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(code)
  return value
}

function timestamp(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY
}

function requiredTimestamp(value: unknown, code: string) {
  const parsed = timestamp(value)
  if (!Number.isFinite(parsed)) throw new Error(code)
  return parsed
}

function requiredDate(value: unknown, code: string) {
  if (typeof value !== 'string') throw new Error(code)
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(code)
  return parsed
}

function optionalDate(value: unknown) {
  if (typeof value !== 'string') return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}
