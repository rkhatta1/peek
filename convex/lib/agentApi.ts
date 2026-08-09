const TOKEN_PREFIX = 'peek'

export async function hashAgentToken(token: string) {
  const bytes = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
}

export function parseAgentToken(token: string) {
  const match = new RegExp(
    `^${TOKEN_PREFIX}_([a-f0-9]{24})_([a-f0-9]{64})$`,
  ).exec(token)
  return match ? { tokenId: match[1] } : null
}

export function createAgentToken() {
  const tokenId = randomHex(12)
  const secret = randomHex(32)
  return {
    token: `${TOKEN_PREFIX}_${tokenId}_${secret}`,
    tokenId,
  }
}

function randomHex(byteLength: number) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
