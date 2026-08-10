import { useEffect, useState } from 'react'

const CACHE_PREFIX = 'peek:ledger:v1:'

type CacheEntry<T> = {
  revision: number
  rows: T[]
  version: 1
}

type ValueCacheEntry<T> = {
  revision: number
  value: T
  version: 1
}

export function ledgerCacheKey(
  projectId: string,
  ledger: string,
  variant: string,
  rowsPerPage: number,
) {
  return `${projectLedgerPrefix(projectId)}${encodeURIComponent(ledger)}:${encodeURIComponent(variant)}:${rowsPerPage}`
}

export function readLedgerFirstPage<T>(
  storage: Storage,
  key: string,
  revision: number,
): T[] {
  try {
    const value = storage.getItem(key)
    if (!value) return []
    const entry = JSON.parse(value) as Partial<CacheEntry<T>>
    if (
      entry.version !== 1 ||
      entry.revision !== revision ||
      !Array.isArray(entry.rows)
    ) {
      storage.removeItem(key)
      return []
    }
    return entry.rows
  } catch {
    storage.removeItem(key)
    return []
  }
}

export function writeLedgerFirstPage<T>(
  storage: Storage,
  key: string,
  revision: number,
  rows: T[],
) {
  try {
    const entry: CacheEntry<T> = { revision, rows, version: 1 }
    storage.setItem(key, JSON.stringify(entry))
  } catch {
    // Cache writes are best-effort (private mode and quota failures are safe).
  }
}

export function readLedgerValue<T>(
  storage: Storage,
  key: string,
  revision: number,
): T | undefined {
  try {
    const value = storage.getItem(key)
    if (!value) return undefined
    const entry = JSON.parse(value) as Partial<ValueCacheEntry<T>>
    if (
      entry.version !== 1 ||
      entry.revision !== revision ||
      !Object.prototype.hasOwnProperty.call(entry, 'value')
    ) {
      storage.removeItem(key)
      return undefined
    }
    return entry.value
  } catch {
    storage.removeItem(key)
    return undefined
  }
}

export function writeLedgerValue<T>(
  storage: Storage,
  key: string,
  revision: number,
  value: T,
) {
  try {
    const entry: ValueCacheEntry<T> = { revision, value, version: 1 }
    storage.setItem(key, JSON.stringify(entry))
  } catch {
    // Cache writes are best-effort (private mode and quota failures are safe).
  }
}

export function invalidateProjectLedgerCaches(
  storage: Storage,
  projectId: string,
) {
  const prefix = projectLedgerPrefix(projectId)
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index)
    if (key?.startsWith(prefix)) storage.removeItem(key)
  }
}

export function invalidateProjectLedgerCache(projectId: string) {
  if (typeof window === 'undefined') return
  invalidateProjectLedgerCaches(window.localStorage, projectId)
}

export function useFirstPageLedgerCache<T>({
  cacheKey,
  networkRows,
  revision,
  rowsPerPage,
  status,
}: {
  cacheKey: string
  networkRows: T[]
  revision: number | undefined
  rowsPerPage: number
  status: 'CanLoadMore' | 'Exhausted' | 'LoadingFirstPage' | 'LoadingMore'
}) {
  const [cached, setCached] = useState<{
    key: string
    revision: number
    rows: T[]
  } | null>(null)

  useEffect(() => {
    if (revision === undefined || typeof window === 'undefined') return
    setCached({
      key: cacheKey,
      revision,
      rows: readLedgerFirstPage<T>(window.localStorage, cacheKey, revision),
    })
  }, [cacheKey, revision])

  useEffect(() => {
    if (
      revision === undefined ||
      status === 'LoadingFirstPage' ||
      typeof window === 'undefined'
    ) return
    writeLedgerFirstPage(
      window.localStorage,
      cacheKey,
      revision,
      networkRows.slice(0, rowsPerPage),
    )
  }, [cacheKey, networkRows, revision, rowsPerPage, status])

  const cachedRows =
    cached?.key === cacheKey && cached.revision === revision ? cached.rows : []
  return status === 'LoadingFirstPage' && !networkRows.length
    ? cachedRows
    : networkRows
}

export function useLedgerValueCache<T>({
  cacheKey,
  networkValue,
  revision,
}: {
  cacheKey: string | null
  networkValue: T | undefined
  revision: number | undefined
}) {
  const [cached, setCached] = useState<{
    key: string
    revision: number
    value: T | undefined
  } | null>(null)

  useEffect(() => {
    if (
      cacheKey === null ||
      revision === undefined ||
      typeof window === 'undefined'
    ) {
      return
    }
    setCached({
      key: cacheKey,
      revision,
      value: readLedgerValue<T>(window.localStorage, cacheKey, revision),
    })
  }, [cacheKey, revision])

  useEffect(() => {
    if (
      cacheKey === null ||
      revision === undefined ||
      networkValue === undefined ||
      typeof window === 'undefined'
    ) {
      return
    }
    writeLedgerValue(window.localStorage, cacheKey, revision, networkValue)
  }, [cacheKey, networkValue, revision])

  if (networkValue !== undefined) return networkValue
  return cached?.key === cacheKey && cached.revision === revision
    ? cached.value
    : undefined
}

function projectLedgerPrefix(projectId: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(projectId)}:`
}
