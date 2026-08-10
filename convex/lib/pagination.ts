export const MAX_LEDGER_PAGE_SIZE = 50

export function enforceLedgerPageSize(numItems: number) {
  if (numItems > MAX_LEDGER_PAGE_SIZE) {
    throw new Error(
      `Page size cannot exceed ${MAX_LEDGER_PAGE_SIZE} items`,
    )
  }
}
