import { createFileRoute } from '@tanstack/react-router'
import { handler } from '#/lib/auth-server'
import {
  forwardAccessGrant,
  isProduction,
  requiresAccessGate,
} from '#/lib/access-gate-server'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: async ({ request }) => {
        if (requiresAccessGate(request)) {
          const forwarded = forwardAccessGrant(request, isProduction())
          if (!forwarded) {
            return Response.json(
              { error: 'access_gate_required' },
              { status: 403 },
            )
          }
          return handler(forwarded)
        }
        return handler(request)
      },
    },
  },
})
