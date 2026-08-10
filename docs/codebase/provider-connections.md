# Provider connections

Peek stores consultancy monitoring data as `Client → Project → Service` in
Convex. Public reads and writes derive ownership from the authenticated Convex
identity; callers never supply an owner identifier.

## Credential boundary

- The service form sends provider credentials directly to
  `serviceActions.connect`.
- The code-connection form sends a GitHub or Vercel token directly to
  `codeConnectionActions.connect` with the provider resource identifier.
- The action validates live provider access before saving anything.
- Credentials are encrypted with AES-256-GCM using a random IV and
  owner-bound additional authenticated data.
- Public queries return connection health and timestamps only. Ciphertext,
  encryption metadata, and plaintext credentials are never returned.
- Rotation replaces the encrypted credential record only after successful
  provider validation.
- Deleting a Service or Code connection removes its credentials immediately.
  Service deletion also schedules bounded metric-history cleanup.

Set `PEEK_CREDENTIAL_ENCRYPTION_KEY` in every Convex deployment to a base64
encoded 32-byte key. To rotate the application encryption key without breaking
existing credentials, temporarily set
`PEEK_CREDENTIAL_PREVIOUS_ENCRYPTION_KEY` to the prior key, rotate each Service
through the product, then remove the previous key.

Never place either encryption key or provider credentials in a `VITE_`
variable, checked-in file, URL search parameter, browser storage, or log.

## Provider access

### Neon Postgres

Peek accepts a password-bearing `postgres://` or `postgresql://` connection
string whose hostname ends in `.neon.tech`. SSL cannot be disabled. The
collector reads `pg_stat_database`, the current logical database size, and
whether `pg_stat_statements` is installed. Use a dedicated least-privilege
database role with access only to the database being monitored.

### Upstash Redis

Peek accepts the Upstash account email, Management API key, and Redis database
ID. It calls the read-only Developer API database-stats endpoint. The
Management API key is account-scoped, so use a dedicated Upstash account/team
or narrowly administered credential where the client's isolation requirements
demand it.

## Code attribution connections

GitHub and Vercel are Project-level Code connections, separate from monitored
Services. Each Project supports one active connection per code provider.

- GitHub stores the validated repository ID and `owner/repository` name. Event
  drawers request `GET /repos/{owner}/{repo}/commits` with `sha=main`,
  `until=<observed time>`, and `per_page=1`, then request up to three pull
  requests associated with that commit.
- The Agent page incrementally syncs `main` commits in GitHub pages of 100,
  stops when it reaches a cached SHA, and stores only bounded commit metadata.
  Sync is capped at 10,000 commits and one request per connection per minute.
  A renewable 60-second lease fences overlapping and stale sync writes. Provider
  requests time out after 15 seconds. Its Convex ledger uses indexed cursor
  pagination.
- Vercel stores the validated project ID and name. Event drawers request ready
  production deployments from `main` created before the observation, then
  select the newest deployment whose ready timestamp is not after the event.
- Attribution is lazy and point-in-time. Provider metric collection makes no
  GitHub or Vercel API calls.
- Attribution is forensic correlation, not evidence that a commit caused the
  provider condition.
- Each connection stores its token in `codeConnectionCredentials`, encrypted
  with the same write-only envelope used by Service credentials. Public queries
  return Code connection metadata only.
- GitHub tokens should be fine-grained and limited to the selected repository
  with Contents read and Pull requests read. This also supports private client
  repositories.
- Vercel tokens should be project-scoped. Vercel infers the project and team
  from that token, so Peek neither asks for nor stores a separate team ID.

## Collection and performance

- Manual refresh is scoped to the selected Project and at most 20 active
  Services.
- The cron collector paginates active Services by Project in batches of 25,
  carries the final Project aggregate across page boundaries, and limits
  provider calls to five concurrent requests.
- Overview reads are bounded to 20 Services and 96 indexed snapshots per
  Service.
- Each Project collection writes one immutable Check trigger with aggregate
  outcomes. Checks and Agent ledgers use Convex cursor pagination; denormalized
  Project counters provide exact table totals without scanning either ledger.
- Client and Project lists are indexed, owner-scoped, and capped at 100.
- Deletes disappear optimistically in the UI, then perform bounded recursive
  cleanup in scheduled Convex mutations.

The old `workspaces`, `connections`, and `metricSnapshots` tables are retained
temporarily as inert legacy data. New product code reads only `clients`,
`projects`, `serviceConnections`, `serviceCredentials`,
`serviceMetricSnapshots`, and `codeConnections`.
Encrypted Code connection secrets live separately in
`codeConnectionCredentials`.
