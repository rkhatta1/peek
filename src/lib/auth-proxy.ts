const BODYLESS_METHODS = new Set(['GET', 'HEAD'])
const MAX_AUTH_BODY_BYTES = 1024 * 1024

export async function proxyAuthRequest(
  request: Request,
  convexSiteUrl: string,
  forwardedHeaders: HeadersInit = request.headers,
) {
  const requestUrl = new URL(request.url)
  const siteUrl = new URL(convexSiteUrl)
  const headers = new Headers(forwardedHeaders)

  headers.delete('transfer-encoding')
  headers.delete('content-length')
  headers.delete('connection')
  headers.set('accept-encoding', 'application/json')
  headers.set('host', siteUrl.host)
  headers.set('x-forwarded-host', requestUrl.host)
  headers.set('x-forwarded-proto', requestUrl.protocol.replace(/:$/, ''))
  headers.set('x-better-auth-forwarded-host', requestUrl.host)
  headers.set(
    'x-better-auth-forwarded-proto',
    requestUrl.protocol.replace(/:$/, ''),
  )

  let body: ArrayBuffer | undefined
  if (!BODYLESS_METHODS.has(request.method)) {
    const buffered = await readAuthBody(request)
    if (!buffered) {
      return Response.json({ error: 'request_too_large' }, { status: 413 })
    }
    body = buffered
  }

  return fetch(`${siteUrl.origin}${requestUrl.pathname}${requestUrl.search}`, {
    method: request.method,
    headers,
    redirect: 'manual',
    body,
  })
}

async function readAuthBody(request: Request) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > MAX_AUTH_BODY_BYTES) return null

  const reader = request.body?.getReader()
  if (!reader) return new ArrayBuffer(0)

  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_AUTH_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body.buffer
}
