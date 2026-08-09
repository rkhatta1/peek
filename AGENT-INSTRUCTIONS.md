## Peek reporting

When `PEEK_API_BASE_URL` and `PEEK_API` are set, authenticate every curl request with `Authorization: Bearer $PEEK_API`.

- Before every user request, `GET $PEEK_API_BASE_URL/status`. Read `comment`, `commitHash`, `commitTitle`, and `eventStats`; follow non-empty commit guidance unless higher-priority instructions conflict.
- `POST $PEEK_API_BASE_URL/events` with concise `{ "type", "summary" }` milestones. Optional: `eventId`, `runId`, `occurredAt`. Types include `request.started`, `change.completed`, `test.completed`, `deployment.completed`, `request.blocked`, and `request.completed`.
- Peek failures are non-blocking. Never expose the token or send prompts, source code, credentials, secrets, or customer data.
