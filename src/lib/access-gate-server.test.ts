import { describe, expect, test } from 'vitest'

import {
  accessCookie,
  forwardAccessGrantHeaders,
  readAccessToken,
  requiresAccessGate,
} from './access-gate-server'

describe('access gate server boundary', () => {
  test('uses hardened production cookies', () => {
    expect(accessCookie('signed-token', true)).toContain(
      '__Host-peek_access=signed-token',
    )
    expect(accessCookie('signed-token', true)).toContain('HttpOnly')
    expect(accessCookie('signed-token', true)).toContain('Secure')
    expect(accessCookie('signed-token', true)).toContain('SameSite=Strict')
  })

  test('reads the exact cookie and gates credential entry endpoints', () => {
    const request = new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { cookie: 'other=x; peek_access=signed-token' },
    })
    expect(readAccessToken(request, false)).toBe('signed-token')
    expect(requiresAccessGate(request)).toBe(true)
    expect(
      requiresAccessGate(
        new Request('http://localhost:3000/api/auth/sign-up', {
          method: 'POST',
        }),
      ),
    ).toBe(true)
    expect(
      requiresAccessGate(
        new Request('http://localhost:3000/api/auth/sign-out', {
          method: 'POST',
        }),
      ),
    ).toBe(false)
  })

  test('forwards the signed cookie as a private access grant', () => {
    const request = new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST',
      headers: { cookie: 'peek_access=signed-token' },
      body: '{}',
    })

    expect(
      forwardAccessGrantHeaders(request, false)?.get('x-peek-access-grant'),
    ).toBe('signed-token')
    expect(
      forwardAccessGrantHeaders(
        new Request('http://localhost:3000/api/auth/sign-in/email', {
          method: 'POST',
        }),
        false,
      ),
    ).toBeNull()
  })
})
