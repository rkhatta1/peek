import { createFileRoute } from '@tanstack/react-router'

import {
  accessCookie,
  clearAccessCookie,
  hasAccessGate,
  isProduction,
  isSameOrigin,
  readAccessCode,
  verifyManagedAccessCode,
} from '#/lib/access-gate-server'

export const Route = createFileRoute('/api/access')({
  server: {
    handlers: {
      GET: async ({ request }) => json({ ok: await hasAccessGate(request) }),
      POST: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403)
        const code = await readAccessCode(request)
        if (!code) return json({ error: 'invalid_request' }, 400)
        const result = await verifyManagedAccessCode(code)
        if (!result.ok) return json({ error: 'invalid_access_code' }, 401)
        return json(
          { ok: true },
          200,
          new Headers({ 'set-cookie': accessCookie(result.token, isProduction()) }),
        )
      },
      DELETE: async ({ request }) => {
        if (!isSameOrigin(request)) return json({ error: 'forbidden' }, 403)
        return json(
          { ok: true },
          200,
          new Headers({ 'set-cookie': clearAccessCookie(isProduction()) }),
        )
      },
    },
  },
})

function json(body: unknown, status = 200, headers = new Headers()) {
  headers.set('cache-control', 'no-store')
  headers.set('content-type', 'application/json; charset=utf-8')
  return new Response(JSON.stringify(body), { headers, status })
}
