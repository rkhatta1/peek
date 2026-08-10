import { afterEach, describe, expect, test, vi } from 'vitest'

import { proxyAuthRequest } from './auth-proxy'

describe('auth proxy', () => {
  afterEach(() => vi.restoreAllMocks())

  test('buffers POST bodies before forwarding them to Convex', async () => {
    const upstream = new Response(null, { status: 204 })
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(upstream)
    const request = new Request(
      'http://localhost:3000/api/auth/sign-out?redirect=false',
      {
        method: 'POST',
        headers: {
          connection: 'keep-alive',
          'content-length': '2',
          'content-type': 'application/json',
        },
        body: '{}',
      },
    )
    const headers = new Headers(request.headers)
    headers.set('x-peek-access-grant', 'signed-token')

    const response = await proxyAuthRequest(
      request,
      'https://example.convex.site',
      headers,
    )

    expect(response).toBe(upstream)
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(url).toBe(
      'https://example.convex.site/api/auth/sign-out?redirect=false',
    )
    expect(init?.redirect).toBe('manual')
    expect(init?.body).toBeInstanceOf(ArrayBuffer)
    expect(new TextDecoder().decode(init?.body as ArrayBuffer)).toBe('{}')

    const forwarded = new Headers(init?.headers)
    expect(forwarded.get('connection')).toBeNull()
    expect(forwarded.get('content-length')).toBeNull()
    expect(forwarded.get('x-peek-access-grant')).toBe('signed-token')
    expect(forwarded.get('x-forwarded-host')).toBe('localhost:3000')
  })

  test('rejects oversized auth bodies before buffering', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const response = await proxyAuthRequest(
      new Request('http://localhost:3000/api/auth/sign-out', {
        method: 'POST',
        headers: { 'content-length': '1048577' },
        body: '{}',
      }),
      'https://example.convex.site',
    )

    expect(response.status).toBe(413)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})
