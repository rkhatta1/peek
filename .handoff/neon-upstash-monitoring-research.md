# Handoff: Neon + Upstash monitoring research

**Date:** 2026-08-06  
**Status:** Research complete; first monitoring application slice implemented.

## User goal

The user is advising a client building a Next.js Turborepo CRM. The client uses Neon Postgres and Upstash Redis in development and production, and the user wants a lightweight external dashboard and alerting system for database/cache performance and usage, without needing access to the client machine.

## Confirmed findings

- Neon has no documented webhook for database metrics, I/O, usage, or query performance. Its documented webhooks are for Neon Auth events only.
- Neon exposes billable consumption through its Consumption History API. It supports hourly, daily, and monthly granularity; hourly data updates about every 15 minutes. It includes compute, storage, and public/private network-transfer metrics. The paid-plan endpoint is `/api/v2/consumption_history/v2/projects`.
- Neon can export platform metrics and Postgres logs to Datadog, Grafana Cloud, and OpenTelemetry-compatible backends, subject to plan/feature availability.
- Neon supports `pg_stat_statements`; combine it with `pg_stat_database` for query-level diagnosis.
- Upstash Redis has no documented provider webhook for usage or performance thresholds.
- Upstash Developer API exposes `GET https://api.upstash.com/v2/redis/stats/{id}` for request counts, bandwidth, read/write latency (mean and p99), throughput, connections, hits/misses, storage, billing, and per-command counts. It uses Developer API credentials with HTTP Basic auth.
- Upstash Redis REST supports `MONITOR` as an SSE stream of every command. Reserve it for short incident investigation because it is noisy and may expose key/command data.
- Upstash keyspace notifications are Redis Pub/Sub application/key-change events, not resource-usage telemetry.
- Upstash has Prometheus monitoring for Pro databases or Enterprise coverage (plan documentation also describes this as Prod Pack/Enterprise).
- `@neondatabase/serverless` and `@upstash/redis` are application drivers, not platform-monitoring SDKs.

## Recommended architecture

```text
Hosted collector (5–15 minutes)
  ├─ Neon Consumption API
  ├─ Neon Postgres stats (pg_stat_statements / pg_stat_database)
  ├─ Upstash Developer API: /v2/redis/stats/{id}
  └─ Normalize snapshots → evaluate thresholds → persist + notify
```

Signals: Neon transfer, compute, storage, connections, query fingerprints, buffer I/O; Upstash p99 latency, throughput, requests, cache misses, bandwidth, connections, storage, and command mix.

For code-path attribution, add OpenTelemetry to the CRM and emit slow-operation/error events. Provider metrics show that usage occurred; application telemetry identifies the responsible code path.

## Security constraints

- Store provider credentials only in the hosted collector/server environment.
- Use dedicated least-privilege access where possible.
- Never expose Neon connection strings, Upstash Redis REST tokens, or Developer API keys in dashboard client code.
- Redact SQL parameters, Redis key names, and PII from telemetry and alerts.
- Never run a permanent Redis `MONITOR` stream.

## Sources

- Neon consumption: https://neon.com/docs/guides/consumption-metrics
- Neon network-transfer API: https://neon.com/docs/introduction/network-transfer
- Neon external monitoring: https://neon.com/docs/guides/datadog
- Neon Auth webhooks: https://neon.com/docs/auth/guides/webhooks
- Neon query performance: https://neon.com/blog/postgres-support-recap-investigating-postgres-query-performance
- Upstash stats API: https://upstash.com/docs/devops/developer-api/redis/get_database_stats
- Upstash API auth: https://upstash.com/docs/devops/developer-api/authentication
- Upstash REST MONITOR: https://upstash.com/docs/redis/features/restapi
- Upstash metrics: https://upstash.com/docs/redis/howto/metrics-and-charts
- Upstash keyspace notifications: https://upstash.com/docs/redis/howto/keyspacenotifications
- Upstash Prometheus: https://upstash.com/docs/redis/integrations/prometheus

## Suggested skills

- `research`, `firecrawl`: verify current APIs, plan gating, and docs.
- `vercel:nextjs`, `vercel:verification`: build and validate the monitoring dashboard.
- `neon` or `neon-postgres`: secure Neon access and queries.
- `upstash`, `upstash-redis-js`: integrate Upstash access.
- `web-design-guidelines`: review dashboard UI.

## Implemented in Peek

- TanStack Start dashboard with a compact shadcn/ui shell and responsive auth flow.
- Better Auth email/password sessions backed by the Convex Better Auth component.
- Authenticated Convex workspace, connection, and metric snapshot domain model.
- Neon `pg_stat_database` collector and Upstash Developer API stats collector.
- Fifteen-minute scheduled collection plus an optimistic manual refresh.
- Bounded, indexed overview reads: eight connections and 96 snapshots per connection.
- Explicit demo mode when server-side provider credentials are absent.
- Threshold evaluation for stale data, provider failures, Neon deadlocks/query insights, and Upstash p99 latency.
- Four unit tests for normalization and threshold behavior, plus browser verification of sign-up and dashboard refresh.
- Persistent Vercel-inspired client/project navigation with route-level code
  splitting for overview, checks, connections, and settings.
- Searchable shadcn client/project selectors, shared project scope, responsive
  sidebar collapse behavior, and synchronized light/dark preferences.
- Self-hosted Poppins 400/500/600 Latin assets across all interface and telemetry
  text; moss remains a rare status/identity accent.

## Remaining production decisions

- Hosting URL and production `SITE_URL`.
- Alert delivery channel and escalation rules.
- Consultancy-wide shared workspace versus per-user workspaces.
- Retention/compaction policy for `metricSnapshots`.
- Whether to add Neon Consumption API metrics alongside database evidence.
