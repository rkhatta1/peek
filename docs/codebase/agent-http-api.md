# Agent HTTP API

Peek exposes two Convex HTTP actions at the deployment's `.convex.site` origin:

- `GET /status` returns the active commit comment, full commit hash, commit
  title, and the next attributed Check trigger's aggregate stats.
- `POST /events` accepts a concise Agent event and returns the same commit-aware
  status alongside its acceptance result.

Both require `Authorization: Bearer <token>`. A token belongs to one Project,
is displayed once when created or rotated, and is stored as a SHA-256 hash.
Rotation invalidates the prior token without changing the active commit comment.
Revocation and Project or Client deletion invalidate access immediately.

With no active commit, status temporarily returns any legacy Project comment
with null commit fields and null `eventStats`. Selecting commit guidance clears
that rollout fallback permanently. Comments are created from the Agent page
against a cached GitHub `main` commit. The first Check trigger at or after that
commit supplies its event stats; without a later trigger, `eventStats` remains
null.

## Event body

```json
{
  "eventId": "optional-idempotency-key",
  "runId": "optional-agent-run-id",
  "type": "test.completed",
  "summary": "Checkout tests passed.",
  "occurredAt": 1786000000000
}
```

`type` and `summary` are required. Peek generates `eventId` and `occurredAt`
when omitted. Repeating an `eventId` within a Project is accepted without
creating a duplicate. Reads are Project-scoped and bounded.

Agents must send summaries only—not prompts, source code, secrets, credentials,
or customer data. Agent events report intent and observations. GitHub, Vercel,
and monitored Services remain authoritative for code, deployment, and provider
facts.

## Agent setup

Store these outside the repository in the agent's secret environment:

```bash
PEEK_API_BASE_URL=https://your-deployment.convex.site
PEEK_API_TOKEN=peek_...
```

The repository `AGENTS.md` tells configured agents to check `/status` before
each user request and post concise milestones to `/events`. Never paste the
token into `AGENTS.md`, a URL, logs, or committed environment files.
