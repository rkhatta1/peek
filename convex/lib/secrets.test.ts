import { describe, expect, test } from 'vitest'

import {
  decryptCodeConnectionCredentials,
  decryptCredentials,
  encryptCodeConnectionCredentials,
  encryptCredentials,
} from './secrets'

const key = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8='

describe('provider credential encryption', () => {
  test.each([
    { provider: 'github' as const, token: 'github-client-token' },
    { provider: 'vercel' as const, token: 'vercel-project-token' },
  ])('round-trips encrypted $provider code connection credentials', async (credentials) => {
    const encrypted = await encryptCodeConnectionCredentials(
      credentials,
      'peek|owner',
      key,
    )

    expect(encrypted.ciphertext).not.toContain(credentials.token)
    await expect(
      decryptCodeConnectionCredentials(encrypted, 'peek|owner', [key]),
    ).resolves.toEqual(credentials)
  })

  test('round-trips credentials without embedding plaintext', async () => {
    const encrypted = await encryptCredentials(
      { provider: 'neon', databaseUrl: 'postgresql://user:secret@example.neon.tech/db' },
      'peek|owner',
      key,
    )

    expect(encrypted.ciphertext).not.toContain('secret')
    await expect(decryptCredentials(encrypted, 'peek|owner', [key])).resolves.toEqual({
      provider: 'neon',
      databaseUrl: 'postgresql://user:secret@example.neon.tech/db',
    })
  })

  test('refuses decryption under a different owner', async () => {
    const encrypted = await encryptCredentials(
      { provider: 'upstash', email: 'ops@example.com', apiKey: 'secret', databaseId: 'db' },
      'peek|owner',
      key,
    )

    await expect(decryptCredentials(encrypted, 'peek|stranger', [key])).rejects.toThrow()
  })
})
