import { describe, expect, test } from 'vitest'

import { withSecurityHeaders } from './security-headers'

describe('web security headers', () => {
  test('adds browser isolation headers and production HSTS', () => {
    const response = withSecurityHeaders(new Response('ok'), true)

    expect(response.headers.get('content-security-policy')).toContain(
      "frame-ancestors 'none'",
    )
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin',
    )
    expect(response.headers.get('strict-transport-security')).toContain(
      'max-age=',
    )
  })
})
