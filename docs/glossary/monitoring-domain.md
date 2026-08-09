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

## Credential

The provider secret material required to validate and access one Service or
Code connection. A Credential belongs to exactly one connection. Credentials
are write-only from the product UI: Peek may replace or delete them, but never
returns their plaintext through a query.

## Metric snapshot

A time-stamped, normalized observation collected from one Service. Snapshots
belong transitively to the Service's Project and Client.

## Ownership

Clients, Projects, Services, Code connections, Credentials, and Metric snapshots
are isolated by the authenticated Peek identity. A user cannot read or mutate
another user's monitoring resources.

## Lifecycle

Deleting a Client removes it and all descendant Projects and Services from the
active product immediately. Deleting a Project does the same for its Services
and Code connections. Deleting a Service or Code connection removes its stored
Credential immediately. Historical snapshots and remaining descendant records
are then removed by bounded background cleanup.
