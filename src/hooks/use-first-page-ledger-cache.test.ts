import { describe, expect, test } from 'vitest'

import {
  invalidateProjectLedgerCaches,
  ledgerCacheKey,
  readLedgerFirstPage,
  writeLedgerFirstPage,
} from './use-first-page-ledger-cache'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('first-page ledger cache', () => {
  test('returns rows only for the current server revision', () => {
    const storage = new MemoryStorage()
    const key = ledgerCacheKey('project-1', 'checks', 'all', 20)
    writeLedgerFirstPage(storage, key, 12, [{ id: 'one' }])

    expect(readLedgerFirstPage(storage, key, 12)).toEqual([{ id: 'one' }])
    expect(readLedgerFirstPage(storage, key, 13)).toEqual([])
  })

  test('invalidates every ledger variant for one project only', () => {
    const storage = new MemoryStorage()
    const first = ledgerCacheKey('project-1', 'checks', 'all', 20)
    const second = ledgerCacheKey('project-1', 'agent', 'main', 20)
    const other = ledgerCacheKey('project-2', 'checks', 'all', 20)
    writeLedgerFirstPage(storage, first, 1, [])
    writeLedgerFirstPage(storage, second, 1, [])
    writeLedgerFirstPage(storage, other, 1, [])

    invalidateProjectLedgerCaches(storage, 'project-1')

    expect(storage.getItem(first)).toBeNull()
    expect(storage.getItem(second)).toBeNull()
    expect(storage.getItem(other)).not.toBeNull()
  })
})
