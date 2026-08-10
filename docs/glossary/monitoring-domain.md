# Monitoring domain

## Client

An organization advised or operated by the consultancy. A Client belongs to the
authenticated Peek user and can contain many Projects.

## Project

One application a Client is building or operating. A Project belongs to exactly
one Client and can contain many Services.

## Service

An external infrastructure resource connected to a Project for monitoring. A
Service belongs to exactly one Project. Peek currently supports Neon Postgres
and Upstash Redis services.

## Code connection

An external source used to identify the code state associated with a Project's
monitoring observation. A Code connection belongs to exactly one Project and
does not produce metric snapshots. Peek supports one GitHub repository and one
Vercel project per Project. GitHub attribution uses the latest commit reachable
from `main` at the observation time; Vercel attribution uses the latest ready
production deployment from `main` at that time.

## Code attribution

A time-based forensic association between a Metric snapshot and the GitHub
commit, pull request, and Vercel deployment visible at the snapshot's capture
time. Attribution describes code state at observation time; it does not prove
that the code caused the observed provider condition.

## Check trigger

An immutable Project-level ledger entry created when Peek collects connected
Service metrics. A Check trigger records when collection started and finished,
its source, and aggregate Service outcomes. The Checks page shows this ledger;
new triggers never replace earlier entries.

## Collection interval

The whole-number period, in minutes, between scheduled collection starts for
one Project. Each Project defaults to 15 minutes and may be configured from 1
through 1,440 minutes. A new interval applies from the time it is saved.
Scheduled collection never overlaps for the same Project; provider work or
retries may delay a run beyond its configured interval.

## Main commit

A commit reachable from the connected GitHub repository's `main` branch and
cached by Peek for the Agent ledger. GitHub remains authoritative for commit
identity and history.

## Commit event attribution

The next Check trigger at or after a Main commit closes that commit's monitoring
interval. Equivalently, commits after one Check trigger and at or before the
next Check trigger are attributed to the next trigger. A commit remains pending
when no later trigger exists. This is a time-based association, not proof that
the commit caused the observed outcomes.

## Commit comment

Consultancy guidance attached to one Main commit. Posting a Commit comment
makes that commit the Project's active Agent status; clearing it clears the
active status without deleting comments on other commits.

## Agent endpoint

An authenticated HTTP interface through which an AI agent reports its work to
one Project and reads consultancy guidance for that Project. Each Project has
one Agent endpoint, one active API token, and at most one active commented Main
commit. Token rotation does not clear the active Commit comment.

## Agent event

A time-stamped statement reported by an AI agent through a Project's Agent
endpoint. An Agent event records the agent's claimed activity or observation;
it is not authoritative evidence of a commit, deployment, or provider state.
GitHub, Vercel, and monitored Services remain authoritative for those facts.

## Status comment

The active Commit comment returned by a Project's authenticated `/status`
endpoint with its commit hash, commit title, and attributed Check trigger stats.
Agents check it before beginning each user request. With no active Commit
comment, the endpoint returns empty commit context and no event stats.

## Agent API token

A revocable bearer credential granting access only to one Project's Agent
endpoint. Peek displays its plaintext once when created or rotated, stores only
its cryptographic hash, and never places it in checked-in agent instructions.

## Credential

The provider secret material required to validate and access one Service or
Code connection. A Credential belongs to exactly one connection. Credentials
are write-only from the product UI: Peek may replace or delete them, but never
returns their plaintext through a query.

## Metric snapshot

A time-stamped, normalized observation collected from one Service. Snapshots
belong transitively to the Service's Project and Client.

## Ownership

Clients, Projects, Services, Code connections, Credentials, Metric snapshots,
Check triggers, Main commits, Commit comments, Agent endpoints, Agent API
tokens, and Agent events are isolated by the authenticated Peek identity. A
user cannot read or mutate another user's monitoring resources.

## Lifecycle

Deleting a Client removes it and all descendant Projects and Services from the
active product immediately. Deleting a Project does the same for its Services
and Code connections. Deleting a Project or Client revokes descendant Agent API
tokens immediately. Deleting a Service or Code connection removes its stored
Credential immediately. Historical snapshots, Check triggers, cached Main
commits, Agent events, and remaining descendant records are then removed by
bounded background cleanup.
