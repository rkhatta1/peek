import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '#/components/ui/pagination'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { cn } from '#/lib/utils'

const pageSizes = [10, 20, 50] as const

export function LedgerPagination({
  currentPage,
  loadingNext = false,
  onNext,
  onPrevious,
  onRowsPerPageChange,
  rowsPerPage,
  totalRows,
}: {
  currentPage: number
  loadingNext?: boolean
  onNext: () => void
  onPrevious: () => void
  onRowsPerPageChange: (rows: number) => void
  rowsPerPage: number
  totalRows: number
}) {
  const totalPages = Math.max(1, Math.ceil(totalRows / rowsPerPage))
  const canPrevious = currentPage > 1
  const canNext = currentPage < totalPages

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>Rows per page</span>
        <Select
          onValueChange={(value) => onRowsPerPageChange(Number(value))}
          value={String(rowsPerPage)}
        >
          <SelectTrigger aria-label="Rows per page" className="w-20">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {pageSizes.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <span>{totalRows} total</span>
      </div>
      <Pagination className="mx-0 w-auto">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              aria-disabled={!canPrevious}
              className={cn(!canPrevious && 'pointer-events-none opacity-50')}
              href="#"
              onClick={(event) => {
                event.preventDefault()
                if (canPrevious) onPrevious()
              }}
              tabIndex={canPrevious ? 0 : -1}
            />
          </PaginationItem>
          <PaginationItem>
            <PaginationLink aria-label={`Page ${currentPage}`} href="#" isActive>
              {currentPage}
            </PaginationLink>
          </PaginationItem>
          <PaginationItem>
            <span className="px-2 text-xs text-muted-foreground">
              of {totalPages}
            </span>
          </PaginationItem>
          <PaginationItem>
            <PaginationNext
              aria-disabled={!canNext || loadingNext}
              className={cn(
                (!canNext || loadingNext) && 'pointer-events-none opacity-50',
              )}
              href="#"
              onClick={(event) => {
                event.preventDefault()
                if (canNext && !loadingNext) onNext()
              }}
              tabIndex={canNext && !loadingNext ? 0 : -1}
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}
