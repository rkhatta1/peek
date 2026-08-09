import { useEffect, useMemo, useState } from 'react'

export function usePaginatedLedger<T>({
  loadMore,
  results,
  rowsPerPage,
  status,
}: {
  loadMore: (rows: number) => void
  results: T[]
  rowsPerPage: number
  status: 'CanLoadMore' | 'Exhausted' | 'LoadingFirstPage' | 'LoadingMore'
}) {
  const [currentPage, setCurrentPage] = useState(1)
  const [pendingPage, setPendingPage] = useState<number | null>(null)

  useEffect(() => {
    if (pendingPage === null) return
    const firstPendingRow = (pendingPage - 1) * rowsPerPage
    if (results.length > firstPendingRow || status === 'Exhausted') {
      setCurrentPage(pendingPage)
      setPendingPage(null)
    }
  }, [pendingPage, results.length, rowsPerPage, status])

  const visibleRows = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage
    return results.slice(start, start + rowsPerPage)
  }, [currentPage, results, rowsPerPage])

  return {
    currentPage,
    loadingNext: pendingPage !== null || status === 'LoadingMore',
    next() {
      const nextPage = currentPage + 1
      const firstNextRow = (nextPage - 1) * rowsPerPage
      if (results.length > firstNextRow) {
        setCurrentPage(nextPage)
        return
      }
      if (status === 'CanLoadMore') {
        setPendingPage(nextPage)
        loadMore(rowsPerPage)
      }
    },
    previous() {
      setCurrentPage((page) => Math.max(1, page - 1))
    },
    visibleRows,
  }
}
