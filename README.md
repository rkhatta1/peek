# Peek

Peek is a focused external monitoring dashboard for client Neon Postgres and
Upstash Redis systems. It uses TanStack Start, Convex, Better Auth, Tailwind CSS,
and shadcn/ui.

## Local setup

Requirements: Node.js 22+ and pnpm 11+.

```bash
pnpm install
pnpm convex dev --configure existing --once
pnpm dev
```

The repository enforces a 14-day package release-age policy in
`pnpm-workspace.yaml`.

## Authentication

Better Auth provides email/password sign-up and sign-in. Configure these values
on the Convex deployment:

```bash
pnpm convex env set SITE_URL http://localhost:3000
pnpm convex env set BETTER_AUTH_SECRET <generated-secret>
```

Keep the secret out of committed files. The TanStack app proxies `/api/auth/*`
to the Convex HTTP endpoint and passes the auth token into Convex SSR.

## Provider collection

Set provider credentials in the Convex dashboard or with `pnpm convex env set`:

```text
NEON_DATABASE_URL
UPSTASH_EMAIL
UPSTASH_API_KEY
UPSTASH_DATABASE_ID
```

Optional display labels are documented in `.env.example`. Without provider
credentials, Peek enters an explicit demo mode and never presents sample values
as live telemetry.

Collectors run every 15 minutes and can also be triggered from the dashboard.
Neon reads bounded `pg_stat_database` evidence; Upstash reads its Developer API
stats endpoint. Secrets stay inside Convex actions.

## Quality checks

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm convex dev --once
```

The production server is emitted to `.output/server/index.mjs`.
