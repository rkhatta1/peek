import { useEffect, useState } from 'react'

const CACHE_PREFIX = 'peek:ledger:v1:'

type CacheEntry<T> = {
  revision: number
  rows: T[]
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

function projectLedgerPrefix(projectId: string) {
  return `${CACHE_PREFIX}${encodeURIComponent(projectId)}:`
}
