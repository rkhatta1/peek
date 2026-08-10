import { createFileRoute } from '@tanstack/react-router'
import { handler } from '#/lib/auth-server'
import {
  forwardAccessGrantHeaders,
  isProduction,
  requiresAccessGate,
} from '#/lib/access-gate-server'

export const Route = createFileRoute('/api/auth/$')({
  server: {
    handlers: {
      GET: ({ request }) => handler(request),
      POST: async ({ request }) => {
        if (requiresAccessGate(request)) {
          const headers = forwardAccessGrantHeaders(request, isProduction())
          if (!headers) {
            return Response.json(
              { error: 'access_gate_required' },
              { status: 403 },
            )
          }
          return handler(request, headers)
        }
        return handler(request)
      },
    },
  },
})
