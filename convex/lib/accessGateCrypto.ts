const encoder = new TextEncoder()

export const ACCESS_GRANT_HEADER = 'x-peek-access-grant'

export async function hashAccessCode(code: string, secret: string) {
  return await sign(`access-code:${code.trim()}`, secret)
}

export async function createAccessToken(secret: string, expiresAt: number) {
  const expiry = String(expiresAt)
  return `${expiry}.${await sign(`access-grant:${expiry}`, secret)}`
}

export async function verifyAccessToken(
  token: string,
  secret: string,
  now = Date.now(),
) {
  const [expiry, signature, extra] = token.split('.')
  const expiresAt = Number(expiry)
  if (
    extra !== undefined ||
    !signature ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt <= now
  ) {
    return false
  }
  const expected = await sign(`access-grant:${expiry}`, secret)
  return timingSafeEqualString(signature, expected)
}

export function timingSafeEqualString(left: string, right: string) {
  const leftBytes = encoder.encode(left)
  const rightBytes = encoder.encode(right)
  if (leftBytes.length !== rightBytes.length) return false
  let mismatch = 0
  for (let index = 0; index < leftBytes.length; index += 1) {
    mismatch |= leftBytes[index]! ^ rightBytes[index]!
  }
  return mismatch === 0
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(value)),
  )
  let binary = ''
  for (const byte of signature) binary += String.fromCharCode(byte)
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll(/=+$/g, '')
}
