import { useEffect, useState, type ReactNode } from 'react'
import { useConvex, usePaginatedQuery, useQuery } from 'convex/react'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  MoreHorizontal,
} from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Doc, Id } from '../../../../convex/_generated/dataModel'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card } from '#/components/ui/card'
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '#/components/ui/drawer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { usePaginatedLedger } from '#/hooks/use-paginated-ledger'
import {
  ledgerCacheKey,
  useFirstPageLedgerCache,
  useLedgerValueCache,
} from '#/hooks/use-first-page-ledger-cache'
import { AnimatedBackground } from '#/components/motion-primitives/animated-background'
import { LedgerPagination } from '../ledger-pagination'
import { CodeAttributionPanel } from '../code-attribution-panel'
import {
  buildCheckTriggerEventLogs,
  evaluateCheckTriggerEvent,
  formatCheckTriggerAsMarkdown,
  providerDashboardUrl,
} from '../check-trigger-markdown'
import {
  useMonitoring,
  useSelectionPageReady,
  type CodeAttribution,
} from '../monitoring-context'
import { formatTime } from '../monitoring-data'
import { pageTransitionItem } from '../page-transition-item'

type CheckTrigger = Omit<Doc<'checkTriggers'>, 'ownerId' | 'runId'>

export function ChecksPage() {
  const { selectedProject, selectionDataReady } = useMonitoring()
  const [activeTab, setActiveTab] = useState('all')
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const totals = useQuery(
    api.ledgerTotals.get,
    selectedProject ? { projectId: selectedProject._id } : 'skip',
  )
  const attentionTotal = totals?.checkAttentionTriggers ?? 0
  useSelectionPageReady(
    selectionDataReady && !selectedProject,
    selectedProject?._id ?? 'no-project',
  )

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
              revision={totals?.updatedAt}
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
              revision={totals?.updatedAt}
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
  revision,
  rowsPerPage,
  setRowsPerPage,
  totalRows,
}: {
  attentionOnly: boolean
  projectId: Id<'projects'>
  revision: number | undefined
  rowsPerPage: number
  setRowsPerPage: (rows: number) => void
  totalRows: number
}) {
  const { resolveCodeAttribution, selectionDataReady } = useMonitoring()
  const convex = useConvex()
  const [selectedTrigger, setSelectedTrigger] = useState<CheckTrigger | null>(
    null,
  )
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const { results, status, loadMore } = usePaginatedQuery(
    api.checkTriggers.list,
    { projectId, attentionOnly },
    { initialNumItems: rowsPerPage },
  )
  useSelectionPageReady(
    selectionDataReady &&
      revision !== undefined &&
      status !== 'LoadingFirstPage',
    `${projectId}:${attentionOnly ? 'attention' : 'all'}`,
  )
  const displayResults = useFirstPageLedgerCache({
    cacheKey: ledgerCacheKey(
      projectId,
      'checks',
      attentionOnly ? 'attention' : 'all',
      rowsPerPage,
    ),
    networkRows: results,
    revision,
    rowsPerPage,
    status,
  })
  const pagination = usePaginatedLedger({
    loadMore,
    results: displayResults,
    rowsPerPage,
    status,
  })

  async function copyTrigger(trigger: CheckTrigger) {
    try {
      const details = await convex.query(api.checkTriggers.getDetails, {
        triggerId: trigger._id,
      })
      const observedAt = Math.max(
        trigger.triggeredAt,
        ...details.events.map((event) => event.capturedAt),
      )
      const attribution = await resolveCodeAttribution({
        projectId,
        observedAt,
      }).catch(() => null)
      await navigator.clipboard.writeText(
        formatCheckTriggerAsMarkdown({ ...details, attribution }),
      )
      setCopiedId(trigger._id)
      window.setTimeout(() => setCopiedId(null), 1_500)
    } catch {
      setCopiedId(null)
    }
  }

  async function copyTriggerId(trigger: CheckTrigger) {
    try {
      await navigator.clipboard.writeText(trigger._id)
      setCopiedId(trigger._id)
      window.setTimeout(() => setCopiedId(null), 1_500)
    } catch {
      setCopiedId(null)
    }
  }

  return (
    <TooltipProvider delayDuration={700}>
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
              <TableHead className="w-12">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.visibleRows.length ? (
              pagination.visibleRows.map((trigger) => (
                <TableRow
                  aria-label={`View ${triggerTitle(trigger.status)} trigger`}
                  className="cursor-pointer"
                  key={trigger._id}
                  onClick={() => setSelectedTrigger(trigger)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedTrigger(trigger)
                    }
                  }}
                  tabIndex={0}
                >
                  <TableCell>
                    {trigger.status === 'operational' ? (
                      <CheckCircle2 aria-label="Operational" className="size-4" />
                    ) : (
                      <AlertTriangle aria-label="Attention" className="size-4" />
                    )}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium">{triggerTitle(trigger.status)}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Completed in {triggerDuration(trigger)} ms
                    </p>
                  </TableCell>
                  <TableCell className="hidden capitalize text-muted-foreground sm:table-cell">
                    {trigger.source}
                  </TableCell>
                  <TableCell className="hidden tabular-nums md:table-cell">
                    {trigger.serviceCount}
                  </TableCell>
                  <TableCell className="hidden overflow-hidden text-xs text-muted-foreground lg:table-cell">
                    <TruncatedLedgerValue
                      tooltip={`${trigger.operationalCount} operational · ${trigger.attentionCount} attention · ${trigger.unavailableCount} unavailable`}
                    >
                      {trigger.operationalCount} operational ·{' '}
                      {trigger.attentionCount} attention · {trigger.unavailableCount}{' '}
                      unavailable
                    </TruncatedLedgerValue>
                  </TableCell>
                  <TableCell className="overflow-hidden text-right text-xs text-muted-foreground tabular-nums sm:text-left">
                    <TruncatedLedgerValue tooltip={formatDate(trigger.triggeredAt)}>
                      <span className="sm:hidden">
                        {formatShortDate(trigger.triggeredAt)}
                      </span>
                      <span className="hidden sm:inline">
                        {formatDate(trigger.triggeredAt)}
                      </span>
                    </TruncatedLedgerValue>
                  </TableCell>
                  <TableCell
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          aria-label="Trigger actions"
                          size="icon-sm"
                          variant="ghost"
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            onSelect={() => setSelectedTrigger(trigger)}
                          >
                            <ExternalLink aria-hidden="true" data-icon="inline-start" />
                            Open details
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => void copyTrigger(trigger)}
                          >
                            <Copy aria-hidden="true" data-icon="inline-start" />
                            Copy Markdown
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onSelect={() => void copyTriggerId(trigger)}
                        >
                          Copy trigger ID
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="h-28 text-center text-muted-foreground"
                  colSpan={7}
                >
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
      <TriggerDrawer
        copied={Boolean(selectedTrigger && copiedId === selectedTrigger._id)}
        onCopy={copyTrigger}
        onOpenChange={(open) => {
          if (!open) setSelectedTrigger(null)
        }}
        projectId={projectId}
        revision={revision}
        trigger={selectedTrigger}
      />
      <p aria-live="polite" className="sr-only">
        {copiedId ? 'Copied to clipboard.' : ''}
      </p>
    </TooltipProvider>
  )
}

function TriggerDrawer({
  copied,
  onCopy,
  onOpenChange,
  projectId,
  revision,
  trigger,
}: {
  copied: boolean
  onCopy: (trigger: CheckTrigger) => Promise<void>
  onOpenChange: (open: boolean) => void
  projectId: Id<'projects'>
  revision: number | undefined
  trigger: CheckTrigger | null
}) {
  const { codeConnections, resolveCodeAttribution, selectedProjectId } =
    useMonitoring()
  const networkDetails = useQuery(
    api.checkTriggers.getDetails,
    trigger ? { triggerId: trigger._id } : 'skip',
  )
  const detailsCacheKey = trigger
    ? ledgerCacheKey(
        projectId,
        'check-drawer',
        `${trigger._id}:events`,
        1,
      )
    : null
  const details = useLedgerValueCache({
    cacheKey: detailsCacheKey,
    networkValue: networkDetails,
    revision,
  })
  const [attribution, setAttribution] = useState<CodeAttribution | null>(null)
  const [attributionLoading, setAttributionLoading] = useState(false)
  const [attributionResolved, setAttributionResolved] = useState(false)
  const [attributionError, setAttributionError] = useState('')
  const drawerRevision =
    revision === undefined
      ? undefined
      : Math.max(revision, ...codeConnections.map((item) => item.updatedAt))
  const attributionCacheKey = trigger
    ? ledgerCacheKey(
        projectId,
        'check-drawer',
        `${trigger._id}:attribution`,
        1,
      )
    : null
  const cachedAttribution = useLedgerValueCache<CodeAttribution | null>({
    cacheKey: attributionCacheKey,
    networkValue: attributionResolved ? attribution : undefined,
    revision: drawerRevision,
  })
  const displayAttribution = attributionResolved
    ? attribution
    : cachedAttribution ?? null

  useEffect(() => {
    if (!trigger || !details || !selectedProjectId) {
      setAttribution(null)
      setAttributionLoading(false)
      setAttributionResolved(false)
      setAttributionError('')
      return
    }
    const observedAt = Math.max(
      trigger.triggeredAt,
      ...details.events.map((event) => event.capturedAt),
    )
    let active = true
    setAttribution(null)
    setAttributionLoading(true)
    setAttributionResolved(false)
    setAttributionError('')
    void resolveCodeAttribution({ projectId: selectedProjectId, observedAt })
      .then((result) => {
        if (active) setAttribution(result)
      })
      .catch(() => {
        if (active) {
          setAttributionError('Code attribution is temporarily unavailable.')
        }
      })
      .finally(() => {
        if (active) {
          setAttributionLoading(false)
          setAttributionResolved(true)
        }
      })
    return () => {
      active = false
    }
  }, [details, resolveCodeAttribution, selectedProjectId, trigger])

  return (
    <Drawer open={Boolean(trigger)} onOpenChange={onOpenChange}>
      <DrawerContent>
        {trigger ? (
          <div className="mx-auto flex max-h-[calc(88svh-1rem)] w-full max-w-5xl flex-col overflow-hidden">
            <DrawerHeader className="border-b px-6 pb-5 text-left">
              <div className="flex items-center gap-2">
                <DrawerTitle>{triggerTitle(trigger.status)}</DrawerTitle>
                <Badge className="capitalize" variant="outline">
                  {trigger.status}
                </Badge>
              </div>
              <DrawerDescription>
                <span className="capitalize">{trigger.source}</span> trigger ·{' '}
                {formatDate(trigger.triggeredAt)}
              </DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto px-6 py-5">
              <div className="grid gap-8 md:grid-cols-2">
                <section>
                  <p className="text-xs font-medium">Trigger details</p>
                  <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
                    <dt className="text-muted-foreground">Source</dt>
                    <dd className="capitalize">{trigger.source}</dd>
                    <dt className="text-muted-foreground">Services checked</dt>
                    <dd className="tabular-nums">{trigger.serviceCount}</dd>
                    <dt className="text-muted-foreground">Duration</dt>
                    <dd className="tabular-nums">{triggerDuration(trigger)} ms</dd>
                    <dt className="text-muted-foreground">Trigger ID</dt>
                    <dd className="truncate tabular-nums">{trigger._id}</dd>
                  </dl>
                </section>
                <section>
                  <p className="text-xs font-medium">Outcomes</p>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-5 gap-y-3 text-sm">
                    <dt className="text-muted-foreground">Operational</dt>
                    <dd className="tabular-nums">{trigger.operationalCount}</dd>
                    <dt className="text-muted-foreground">Attention</dt>
                    <dd className="tabular-nums">{trigger.attentionCount}</dd>
                    <dt className="text-muted-foreground">Unavailable</dt>
                    <dd className="tabular-nums">{trigger.unavailableCount}</dd>
                  </dl>
                </section>
              </div>

              <section className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">Service event log</p>
                  <Badge variant="outline">
                    {details?.events.length ?? trigger.serviceCount} events
                  </Badge>
                </div>
                {details ? (
                  <div className="mt-3 grid gap-4">
                    {details.events.map((event) => {
                      const evaluation = evaluateCheckTriggerEvent(event)
                      return (
                        <article
                          className="overflow-hidden rounded-xl border"
                          key={event._id}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3">
                            <div>
                              <p className="text-sm font-medium">
                                {event.serviceName}
                              </p>
                              <p className="mt-1 text-xs capitalize text-muted-foreground">
                                {event.provider} · {event.environment} ·{' '}
                                {formatDate(event.capturedAt)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className="capitalize" variant="outline">
                                {evaluation.status}
                              </Badge>
                              <Button asChild size="icon-sm" variant="ghost">
                                <a
                                  aria-label={`View ${event.serviceName} in provider`}
                                  href={providerDashboardUrl(event.provider)}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <ExternalLink aria-hidden="true" />
                                </a>
                              </Button>
                            </div>
                          </div>
                          <div className="grid gap-5 px-4 py-4 md:grid-cols-2">
                            <div>
                              <p className="text-xs font-medium">Evaluation</p>
                              {evaluation.signals.length ? (
                                <div className="mt-2 grid gap-2">
                                  {evaluation.signals.map((signal) => (
                                    <div className="text-xs" key={signal.code}>
                                      <p className="font-medium">
                                        {signal.title}{' '}
                                        <span className="font-normal text-muted-foreground">
                                          · {signal.severity}
                                        </span>
                                      </p>
                                      <p className="mt-1 leading-5 text-muted-foreground">
                                        {signal.detail}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-muted-foreground">
                                  No threshold violations.
                                </p>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-medium">Collector log</p>
                              <div className="mt-2 overflow-hidden rounded-md border bg-muted/20">
                                {buildCheckTriggerEventLogs(event).map(
                                  (log, index) => (
                                    <div
                                      className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 text-xs last:border-b-0"
                                      key={`${event._id}-log-${index}`}
                                    >
                                      <span className="text-muted-foreground tabular-nums">
                                        {formatTime(event.capturedAt)}
                                      </span>
                                      <span className="break-words font-mono text-[0.6875rem]">
                                        {log}
                                      </span>
                                    </div>
                                  ),
                                )}
                              </div>
                            </div>
                          </div>
                        </article>
                      )
                    })}
                    {!details.events.length ? (
                      <p className="rounded-xl border px-4 py-6 text-sm text-muted-foreground">
                        No persisted service events found for this trigger.
                      </p>
                    ) : null}
                    {details.truncated ? (
                      <p className="text-xs text-muted-foreground">
                        Showing the first 100 persisted events.
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3">
                    <Skeleton className="h-40 rounded-xl" />
                    <Skeleton className="h-40 rounded-xl" />
                  </div>
                )}
              </section>

              <section className="mt-8">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">Code attribution</p>
                  <Badge variant="outline">Point in time</Badge>
                </div>
                <CodeAttributionPanel
                  attribution={displayAttribution}
                  error={attributionError}
                  loading={
                    (!attributionResolved && cachedAttribution === undefined) ||
                    (!details && attributionLoading)
                  }
                />
              </section>
            </div>
            <DrawerFooter className="flex-row justify-end border-t px-6 py-4">
              <DrawerClose asChild>
                <Button variant="outline">Close</Button>
              </DrawerClose>
              <Button
                aria-label={copied ? 'Markdown copied' : 'Copy Markdown'}
                className="min-w-[9.75rem]"
                disabled={!details || attributionLoading}
                onClick={() => void onCopy(trigger)}
                variant="outline"
              >
                <span aria-hidden="true" className="relative size-4 shrink-0">
                  <Copy
                    className={`absolute inset-0 transition-[opacity,scale,filter] duration-300 motion-reduce:transition-none ${
                      copied
                        ? 'scale-[0.25] opacity-0 blur-[4px]'
                        : 'scale-100 opacity-100 blur-0'
                    }`}
                  />
                  <Check
                    className={`absolute inset-0 text-[#557a46] transition-[opacity,scale,filter] duration-300 motion-reduce:transition-none ${
                      copied
                        ? 'scale-100 opacity-100 blur-0'
                        : 'scale-[0.25] opacity-0 blur-[4px]'
                    }`}
                  />
                </span>
                Copy Markdown
              </Button>
            </DrawerFooter>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

function TruncatedLedgerValue({
  children,
  tooltip,
}: {
  children: ReactNode
  tooltip: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="block min-w-0 truncate" tabIndex={0}>
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
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

function triggerDuration(trigger: CheckTrigger) {
  return Math.max(0, trigger.completedAt - trigger.triggeredAt)
}

function triggerTitle(status: CheckTrigger['status']) {
  return status === 'operational' ? 'All checks passed' : 'Attention required'
}
