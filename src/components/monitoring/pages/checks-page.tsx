import { useState } from 'react'
import { usePaginatedQuery, useQuery } from 'convex/react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Badge } from '#/components/ui/badge'
import { Card } from '#/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { usePaginatedLedger } from '#/hooks/use-paginated-ledger'
import { AnimatedBackground } from '#/components/motion-primitives/animated-background'
import { LedgerPagination } from '../ledger-pagination'
import { useMonitoring } from '../monitoring-context'
import { pageTransitionItem } from '../page-transition-item'

export function ChecksPage() {
  const { selectedProject } = useMonitoring()
  const [activeTab, setActiveTab] = useState('all')
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const totals = useQuery(
    api.ledgerTotals.get,
    selectedProject ? { projectId: selectedProject._id } : 'skip',
  )
  const attentionTotal = totals?.checkAttentionTriggers ?? 0

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Checks</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div {...pageTransitionItem('checks-toolbar', 0)} className="mb-4">
          <TabsList>
            <AnimatedBackground
              className="rounded-md border bg-background shadow-sm dark:border-input dark:bg-input/30"
              defaultValue={activeTab}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            >
              <TabsTrigger
                className="data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
                data-id="all"
                value="all"
              >
                All
              </TabsTrigger>
              <TabsTrigger
                className="data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
                data-id="attention"
                value="attention"
              >
                <span className="flex items-center gap-1.5">
                  Attention
                  {attentionTotal ? (
                    <Badge className="h-5 min-w-5 px-1.5" variant="secondary">
                      {attentionTotal}
                    </Badge>
                  ) : null}
                </span>
              </TabsTrigger>
            </AnimatedBackground>
          </TabsList>
        </div>
        <TabsContent {...pageTransitionItem('checks-all', 1)} value="all">
          {selectedProject ? (
            <TriggerLedger
              key={`all-${rowsPerPage}`}
              attentionOnly={false}
              projectId={selectedProject._id}
              rowsPerPage={rowsPerPage}
              setRowsPerPage={setRowsPerPage}
              totalRows={totals?.checkTriggers ?? 0}
            />
          ) : (
            <EmptyLedger />
          )}
        </TabsContent>
        <TabsContent
          {...pageTransitionItem('checks-attention', 1)}
          value="attention"
        >
          {selectedProject ? (
            <TriggerLedger
              key={`attention-${rowsPerPage}`}
              attentionOnly
              projectId={selectedProject._id}
              rowsPerPage={rowsPerPage}
              setRowsPerPage={setRowsPerPage}
              totalRows={attentionTotal}
            />
          ) : (
            <EmptyLedger />
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function TriggerLedger({
  attentionOnly,
  projectId,
  rowsPerPage,
  setRowsPerPage,
  totalRows,
}: {
  attentionOnly: boolean
  projectId: Id<'projects'>
  rowsPerPage: number
  setRowsPerPage: (rows: number) => void
  totalRows: number
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.checkTriggers.list,
    { projectId, attentionOnly },
    { initialNumItems: rowsPerPage },
  )
  const pagination = usePaginatedLedger({
    loadMore,
    results,
    rowsPerPage,
    status,
  })

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">
              <span className="sr-only">Status</span>
            </TableHead>
            <TableHead>Trigger</TableHead>
            <TableHead className="hidden w-32 sm:table-cell">Source</TableHead>
            <TableHead className="hidden w-28 md:table-cell">Services</TableHead>
            <TableHead className="hidden w-56 lg:table-cell">Outcomes</TableHead>
            <TableHead className="w-32 text-right sm:w-40 sm:text-left">
              <span className="sm:hidden">Time</span>
              <span className="hidden sm:inline">Triggered</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pagination.visibleRows.length ? (
            pagination.visibleRows.map((trigger) => (
              <TableRow key={trigger._id}>
                <TableCell>
                  {trigger.status === 'operational' ? (
                    <CheckCircle2 aria-label="Operational" className="size-4" />
                  ) : (
                    <AlertTriangle aria-label="Attention" className="size-4" />
                  )}
                </TableCell>
                <TableCell>
                  <p className="font-medium">
                    {trigger.status === 'operational'
                      ? 'All checks passed'
                      : 'Attention required'}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Completed in {Math.max(0, trigger.completedAt - trigger.triggeredAt)} ms
                  </p>
                </TableCell>
                <TableCell className="hidden capitalize text-muted-foreground sm:table-cell">
                  {trigger.source}
                </TableCell>
                <TableCell className="hidden tabular-nums md:table-cell">
                  {trigger.serviceCount}
                </TableCell>
                <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                  {trigger.operationalCount} operational · {trigger.attentionCount}{' '}
                  attention · {trigger.unavailableCount} unavailable
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-xs text-muted-foreground tabular-nums sm:text-left">
                  <span className="sm:hidden">{formatShortDate(trigger.triggeredAt)}</span>
                  <span className="hidden sm:inline">{formatDate(trigger.triggeredAt)}</span>
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell className="h-28 text-center text-muted-foreground" colSpan={6}>
                {status === 'LoadingFirstPage'
                  ? 'Loading triggers…'
                  : 'No check triggers in this view.'}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <LedgerPagination
        currentPage={pagination.currentPage}
        loadingNext={pagination.loadingNext}
        onNext={pagination.next}
        onPrevious={pagination.previous}
        onRowsPerPageChange={setRowsPerPage}
        rowsPerPage={rowsPerPage}
        totalRows={totalRows}
      />
    </Card>
  )
}

function EmptyLedger() {
  return (
    <Card className="grid h-40 place-items-center shadow-none">
      <p className="text-sm text-muted-foreground">Select a Project first.</p>
    </Card>
  )
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function formatShortDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  }).format(timestamp)
}
