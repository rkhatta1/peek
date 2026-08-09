import { describe, expect, test } from 'vitest'

import { normalizeProviderCredentials, providerErrorCode } from './providers'

describe('provider credentials', () => {
  test('accepts secure Neon URLs and trims Upstash identifiers', () => {
    expect(
      normalizeProviderCredentials({
        provider: 'neon',
        databaseUrl:
          'postgresql://monitor:secret@ep-cool-tree.us-east-2.aws.neon.tech/app?sslmode=require',
      }),
    ).toMatchObject({ provider: 'neon' })
    expect(
      normalizeProviderCredentials({
        provider: 'upstash',
        email: ' ops@example.com ',
        apiKey: ' secret ',
        databaseId: ' database-id ',
      }),
    ).toEqual({
      provider: 'upstash',
      email: 'ops@example.com',
      apiKey: 'secret',
      databaseId: 'database-id',
    })
  })

  test('rejects non-Neon databases and insecure Neon URLs', () => {
    expect(() =>
      normalizeProviderCredentials({
        provider: 'neon',
        databaseUrl: 'postgresql://user:secret@example.com/app?sslmode=require',
      }),
    ).toThrow('Neon connection string')
    expect(() =>
      normalizeProviderCredentials({
        provider: 'neon',
        databaseUrl: 'postgresql://user:secret@example.neon.tech/app?sslmode=disable',
      }),
    ).toThrow('SSL')
  })

  test('maps provider failures to safe error codes', () => {
    expect(providerErrorCode(new Error('UPSTASH_HTTP_401'))).toBe('CREDENTIAL_REJECTED')
    expect(providerErrorCode(new Error('password authentication failed for user ops'))).toBe(
      'CREDENTIAL_REJECTED',
    )
    expect(providerErrorCode(new Error('socket exploded'))).toBe('COLLECTION_FAILED')
  })
})
