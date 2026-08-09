const BASE_HEADERS = {
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

export function withSecurityHeaders(response: Response, production: boolean) {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(BASE_HEADERS)) {
    headers.set(name, value)
  }
  headers.set('content-security-policy', contentSecurityPolicy(production))
  if (production) {
    headers.set(
      'strict-transport-security',
      'max-age=63072000; includeSubDomains; preload',
    )
  }
  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
  })
}

function contentSecurityPolicy(production: boolean) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src 'self' 'unsafe-inline'${production ? '' : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    "img-src 'self' data: https:",
    `connect-src 'self' https://*.convex.cloud https://*.convex.site wss://*.convex.cloud wss://*.convex.site${production ? '' : ' http: ws:'}`,
    "object-src 'none'",
    "worker-src 'self' blob:",
  ].join('; ')
}
