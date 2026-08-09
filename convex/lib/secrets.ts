import type { Infer } from 'convex/values'

import type {
  codeConnectionCredentialsValidator,
  encryptedCredentialsValidator,
  providerCredentialsValidator,
} from './validators'

export type EncryptedCredentials = Infer<typeof encryptedCredentialsValidator>
export type ProviderCredentials = Infer<typeof providerCredentialsValidator>
export type CodeConnectionCredentials = Infer<
  typeof codeConnectionCredentialsValidator
>
type SecretPayload = ProviderCredentials | CodeConnectionCredentials

function decodeBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function encodeBase64(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function importEncryptionKey(encodedKey: string) {
  const bytes = decodeBase64(encodedKey)
  if (bytes.byteLength !== 32) {
    throw new Error('PEEK_CREDENTIAL_ENCRYPTION_KEY must contain exactly 32 bytes')
  }
  return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt'])
}

async function identifyKey(encodedKey: string) {
  const digest = await crypto.subtle.digest('SHA-256', decodeBase64(encodedKey))
  return encodeBase64(digest).replaceAll('+', '-').replaceAll('/', '_').slice(0, 12)
}

function additionalData(ownerId: string, binding: string) {
  return new TextEncoder().encode(`peek:${ownerId}:${binding}`)
}

async function encryptSecretPayload(
  credentials: SecretPayload,
  ownerId: string,
  encodedKey: string,
): Promise<EncryptedCredentials> {
  const key = await importEncryptionKey(encodedKey)
  const binding = crypto.randomUUID()
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const plaintext = new TextEncoder().encode(JSON.stringify(credentials))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: additionalData(ownerId, binding) },
    key,
    plaintext,
  )

  return {
    algorithm: 'AES-GCM',
    binding,
    ciphertext: encodeBase64(ciphertext),
    iv: encodeBase64(iv),
    keyId: await identifyKey(encodedKey),
  }
}

async function decryptSecretPayload<T extends SecretPayload>(
  encrypted: EncryptedCredentials,
  ownerId: string,
  encodedKeys: string[],
): Promise<T> {
  const matchingKey = (
    await Promise.all(
      encodedKeys.filter(Boolean).map(async (candidate) => ({
        candidate,
        keyId: await identifyKey(candidate),
      })),
    )
  ).find(({ keyId }) => keyId === encrypted.keyId)?.candidate

  if (!matchingKey) throw new Error('CREDENTIAL_KEY_NOT_AVAILABLE')

  const plaintext = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: decodeBase64(encrypted.iv),
      additionalData: additionalData(ownerId, encrypted.binding),
    },
    await importEncryptionKey(matchingKey),
    decodeBase64(encrypted.ciphertext),
  )

  return JSON.parse(new TextDecoder().decode(plaintext)) as T
}

export function encryptCredentials(
  credentials: ProviderCredentials,
  ownerId: string,
  encodedKey: string,
) {
  return encryptSecretPayload(credentials, ownerId, encodedKey)
}

export function decryptCredentials(
  encrypted: EncryptedCredentials,
  ownerId: string,
  encodedKeys: string[],
) {
  return decryptSecretPayload<ProviderCredentials>(
    encrypted,
    ownerId,
    encodedKeys,
  )
}

export function encryptCodeConnectionCredentials(
  credentials: CodeConnectionCredentials,
  ownerId: string,
  encodedKey: string,
) {
  return encryptSecretPayload(credentials, ownerId, encodedKey)
}

export function decryptCodeConnectionCredentials(
  encrypted: EncryptedCredentials,
  ownerId: string,
  encodedKeys: string[],
) {
  return decryptSecretPayload<CodeConnectionCredentials>(
    encrypted,
    ownerId,
    encodedKeys,
  )
}
