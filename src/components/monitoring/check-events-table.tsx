import { Check, Copy, MoreHorizontal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
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
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Skeleton } from '#/components/ui/skeleton'
import {
  useMonitoring,
  type CodeAttribution,
  type ProviderItem,
} from './monitoring-context'
import {
  formatCheckAsMarkdown,
  formatDateTime,
  formatTime,
  type CheckRow,
} from './monitoring-data'
import { ChecksTable } from './monitoring-panels'

export function CheckEventsTable({
  providers,
  rows,
}: {
  providers: ProviderItem[]
  rows: CheckRow[]
}) {
  const [selectedRow, setSelectedRow] = useState<CheckRow | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function copyCheck(row: CheckRow) {
    try {
      await navigator.clipboard.writeText(formatCheckAsMarkdown(row))
      setCopiedId(row.id)
      window.setTimeout(() => setCopiedId(null), 1500)
    } catch {
      setCopiedId(null)
    }
  }

  function viewInProvider(row: CheckRow) {
    window.open(row.dashboardUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <>
      <ChecksTable
        compact
        onRowOpen={setSelectedRow}
        providers={providers}
        renderActions={(row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Event actions" size="icon-sm" variant="ghost">
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => void copyCheck(row)}>
                  {copiedId === row.id ? 'Copied' : 'Copy'}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => viewInProvider(row)}>
                  View
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        rows={rows}
      />
      <p aria-live="polite" className="sr-only">
        {copiedId ? 'Event copied as Markdown.' : ''}
      </p>
      <EventDrawer
        copied={Boolean(selectedRow && copiedId === selectedRow.id)}
        onCopy={copyCheck}
        onOpenChange={(open) => {
          if (!open) setSelectedRow(null)
        }}
        onView={viewInProvider}
        row={selectedRow}
      />
    </>
  )
}

function EventDrawer({
  copied,
  onCopy,
  onOpenChange,
  onView,
  row,
}: {
  copied: boolean
  onCopy: (row: CheckRow) => Promise<void>
  onOpenChange: (open: boolean) => void
  onView: (row: CheckRow) => void
  row: CheckRow | null
}) {
  const { resolveCodeAttribution, selectedProjectId } = useMonitoring()
  const [attribution, setAttribution] = useState<CodeAttribution | null>(null)
  const [attributionLoading, setAttributionLoading] = useState(false)
  const [attributionError, setAttributionError] = useState('')

  useEffect(() => {
    if (!row?.observedAt || !selectedProjectId) {
      setAttribution(null)
      setAttributionLoading(false)
      setAttributionError('')
      return
    }
    let active = true
    setAttribution(null)
    setAttributionLoading(true)
    setAttributionError('')
    void resolveCodeAttribution({
      projectId: selectedProjectId,
      observedAt: row.observedAt,
    })
      .then((result) => {
        if (active) setAttribution(result)
      })
      .catch(() => {
        if (active) setAttributionError('Code attribution is temporarily unavailable.')
      })
      .finally(() => {
        if (active) setAttributionLoading(false)
      })
    return () => {
      active = false
    }
  }, [resolveCodeAttribution, row?.id, row?.observedAt, selectedProjectId])

  return (
    <Drawer open={Boolean(row)} onOpenChange={onOpenChange}>
      <DrawerContent>
        {row ? (
          <div className="mx-auto flex max-h-[calc(80svh-1rem)] w-full max-w-4xl flex-col overflow-hidden">
            <DrawerHeader className="border-b px-6 pb-5 text-left">
              <div className="flex items-center gap-2">
                <DrawerTitle>{row.title}</DrawerTitle>
                <Badge variant="outline" className="capitalize">
                  {row.severity}
                </Badge>
              </div>
              <DrawerDescription>
                {row.service} · {row.environment} · {formatDateTime(row.observedAt)}
              </DrawerDescription>
            </DrawerHeader>
            <div className="grid min-h-0 gap-6 overflow-y-auto px-6 py-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
              <section>
                <p className="text-xs font-medium">Attention reason</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {row.detail}
                </p>
                <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-xs">
                  <dt className="text-muted-foreground">Code</dt>
                  <dd className="truncate tabular-nums">{row.code}</dd>
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd className="capitalize">{row.provider}</dd>
                  <dt className="text-muted-foreground">Event ID</dt>
                  <dd className="truncate tabular-nums">{row.id}</dd>
                </dl>
              </section>
              <section>
                <p className="text-xs font-medium">Related logs</p>
                <div className="mt-2 overflow-hidden rounded-md border bg-muted/20">
                  {row.logs.map((log, index) => (
                    <div
                      className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 border-b px-3 py-2.5 text-xs last:border-b-0"
                      key={`${row.id}-log-${index}`}
                    >
                      <span className="text-muted-foreground tabular-nums">
                        {formatTime(row.observedAt)}
                      </span>
                      <span className="break-words tabular-nums">{log}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="md:col-span-2">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-medium">Code attribution</p>
                  <Badge variant="outline">Point in time</Badge>
                </div>
                <CodeAttributionPanel
                  attribution={attribution}
                  error={attributionError}
                  loading={attributionLoading}
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
                variant="outline"
                onClick={() => void onCopy(row)}
              >
                <span aria-hidden="true" className="relative size-4 shrink-0">
                  <Copy
                    className={`absolute inset-0 transition-[opacity,scale,filter] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
                      copied
                        ? 'scale-[0.25] opacity-0 blur-[4px]'
                        : 'scale-100 opacity-100 blur-0'
                    }`}
                  />
                  <Check
                    className={`absolute inset-0 text-[#557a46] transition-[opacity,scale,filter] duration-300 [transition-timing-function:cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
                      copied
                        ? 'scale-100 opacity-100 blur-0'
                        : 'scale-[0.25] opacity-0 blur-[4px]'
                    }`}
                  />
                </span>
                Copy Markdown
              </Button>
              <Button onClick={() => onView(row)}>View in provider</Button>
            </DrawerFooter>
          </div>
        ) : null}
      </DrawerContent>
    </Drawer>
  )
}

function CodeAttributionPanel({
  attribution,
  error,
  loading,
}: {
  attribution: CodeAttribution | null
  error: string
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="mt-2 grid gap-3 md:grid-cols-2">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    )
  }
  if (error) return <p className="mt-2 text-sm text-destructive">{error}</p>
  if (!attribution?.github && !attribution?.vercel) {
    return (
      <p className="mt-2 text-sm text-muted-foreground">
        Connect GitHub or Vercel to resolve code state for this event.
      </p>
    )
  }

  return (
    <div className="mt-2 grid gap-3 md:grid-cols-2">
      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">GitHub</CardTitle>
          <CardDescription className="text-xs">
            Latest main commit at observation time
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t px-4 py-3">
          {attribution.github?.data ? (
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <a
                  className="font-medium underline-offset-4 hover:underline"
                  href={attribution.github.data.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {shortSha(attribution.github.data.sha)} ·{' '}
                  {attribution.github.data.message}
                </a>
                <p className="mt-1 text-muted-foreground">
                  {attribution.github.data.authorLogin
                    ? `@${attribution.github.data.authorLogin} · `
                    : ''}
                  {formatDateTime(attribution.github.data.committedAt)}
                </p>
              </div>
              {attribution.github.data.pullRequests.length ? (
                <div className="flex flex-col gap-1">
                  {attribution.github.data.pullRequests.map((pullRequest) => (
                    <a
                      className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                      href={pullRequest.url}
                      key={pullRequest.number}
                      rel="noreferrer"
                      target="_blank"
                    >
                      PR #{pullRequest.number} · {pullRequest.title}
                    </a>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No associated pull request.</p>
              )}
            </div>
          ) : (
            <AttributionUnavailable
              connected={Boolean(attribution.github)}
              errorCode={attribution.github?.errorCode ?? null}
            />
          )}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0 shadow-none">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">Vercel</CardTitle>
          <CardDescription className="text-xs">
            Latest ready production deployment from main
          </CardDescription>
        </CardHeader>
        <CardContent className="border-t px-4 py-3">
          {attribution.vercel?.data ? (
            <div className="flex flex-col gap-2 text-xs">
              <a
                className="font-medium underline-offset-4 hover:underline"
                href={attribution.vercel.data.url}
                rel="noreferrer"
                target="_blank"
              >
                {attribution.vercel.data.name} ·{' '}
                {attribution.vercel.data.deploymentId}
              </a>
              <p className="text-muted-foreground">
                Ready {formatDateTime(attribution.vercel.data.readyAt)}
              </p>
              {attribution.vercel.data.commitSha ? (
                <p className="tabular-nums text-muted-foreground">
                  Commit {shortSha(attribution.vercel.data.commitSha)}
                </p>
              ) : null}
            </div>
          ) : (
            <AttributionUnavailable
              connected={Boolean(attribution.vercel)}
              errorCode={attribution.vercel?.errorCode ?? null}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function AttributionUnavailable({
  connected,
  errorCode,
}: {
  connected: boolean
  errorCode: string | null
}) {
  return (
    <p className="text-xs text-muted-foreground">
      {connected
        ? attributionErrorMessage(errorCode)
        : 'Not connected for this project.'}
    </p>
  )
}

function attributionErrorMessage(errorCode: string | null) {
  if (!errorCode) return 'No matching code state before this event.'
  if (errorCode === 'CREDENTIAL_NOT_CONFIGURED') {
    return 'Update this connection to add its provider token.'
  }
  if (errorCode === 'CREDENTIAL_REJECTED') return 'Provider rejected the token.'
  if (errorCode?.startsWith('CREDENTIAL_')) {
    return 'Stored credentials could not be used. Update this connection.'
  }
  if (errorCode === 'RESOURCE_NOT_FOUND') return 'Connected resource was not found.'
  return 'Provider attribution is temporarily unavailable.'
}

function shortSha(sha: string) {
  return sha.slice(0, 7)
}
