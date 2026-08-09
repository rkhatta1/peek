# Peek

Peek is a focused external monitoring dashboard for client Neon Postgres and
Upstash Redis systems, with GitHub/Vercel code attribution for provider events.
It uses TanStack Start, Convex, Better Auth, Tailwind CSS, and shadcn/ui.

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
pnpm convex env set PEEK_ACCESS_CODE <managed-development-code>
openssl rand -base64 32 | pnpm convex env set PEEK_CREDENTIAL_ENCRYPTION_KEY
pnpm convex run accessGate:seedDevelopmentAccessCode --push
```

Keep the secret out of committed files. The TanStack app proxies `/api/auth/*`
to the Convex HTTP endpoint and passes the auth token into Convex SSR. The seed
command stores only a keyed hash, runs only for loopback development sites, and
does not overwrite an existing code. Sign-in and sign-up remain server-gated;
the browser receives a signed, HTTP-only 12-hour access cookie after approval.

## Provider collection

Create a Client, create a Project for one app, then connect its Neon Postgres
and Upstash Redis Services in the dashboard. Provider credentials are validated
live, AES-256-GCM encrypted, and never returned by public Convex queries.

Collectors run every 15 minutes and can also be triggered from the dashboard.
Neon reads bounded `pg_stat_database` evidence; Upstash reads its Developer API
stats endpoint. Secret rotation and deletion are managed from Connections.

See [`docs/codebase/provider-connections.md`](./docs/codebase/provider-connections.md)
for credential rotation, least-privilege access, and collection bounds.

## Code attribution

Connect one GitHub repository and one Vercel project to each Peek Project. Event
drawers resolve the latest commit on `main`, associated pull requests, and the
latest ready production Vercel deployment at the event's observation time.

Enter GitHub and Vercel tokens in the Code connection dialog. GitHub needs
repository Contents read and Pull requests read; Vercel should use a
project-scoped token. Tokens are encrypted with the same envelope as Service
credentials and never returned by public queries.

## Quality checks

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm convex dev --once
```

The production server is emitted to `.output/server/index.mjs`.
