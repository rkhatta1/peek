import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAction, useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { ExternalLink, GitCommitHorizontal, MessageSquare, RefreshCw } from 'lucide-react'

import { api } from '../../../../convex/_generated/api'
import type { Id } from '../../../../convex/_generated/dataModel'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Field, FieldError, FieldGroup, FieldLabel } from '#/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { Textarea } from '#/components/ui/textarea'
import { usePaginatedLedger } from '#/hooks/use-paginated-ledger'
import { LedgerPagination } from '../ledger-pagination'
import { useMonitoring } from '../monitoring-context'
import { pageTransitionItem } from '../page-transition-item'

type Commit = FunctionReturnType<typeof api.agentCommits.list>['page'][number]

export function AgentPage() {
  const { codeConnections, selectedProject } = useMonitoring()
  const github = codeConnections.find((connection) => connection.provider === 'github')
  const syncMain = useAction(api.agentCommitActions.syncMain)
  const totals = useQuery(
    api.ledgerTotals.get,
    selectedProject ? { projectId: selectedProject._id } : 'skip',
  )
  const [rowsPerPage, setRowsPerPage] = useState(20)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState('')
  const syncedConnection = useRef<string | null>(null)

  async function sync() {
    if (!selectedProject || !github) return
    setSyncing(true)
    setSyncError('')
    try {
      const result = await syncMain({ projectId: selectedProject._id })
      if (result.truncated) {
        setSyncError('Commit sync reached the 10,000 row safety limit.')
      }
    } catch (error) {
      setSyncError(error instanceof Error ? error.message : 'Could not sync commits')
    } finally {
      setSyncing(false)
    }
  }

  useEffect(() => {
    if (!github || syncedConnection.current === github._id) return
    syncedConnection.current = github._id
    void sync()
  }, [github?._id, selectedProject?._id])

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <div
        {...pageTransitionItem('agent-header', 0)}
        className="mb-4 flex items-start justify-between gap-4"
      >
        <div>
          <h1 className="text-lg font-semibold">Agent</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Main-branch commit guidance and monitoring attribution.
          </p>
        </div>
        <Button
          disabled={!selectedProject || !github || syncing}
          onClick={() => void sync()}
          size="sm"
          variant="outline"
        >
          <RefreshCw data-icon="inline-start" />
          {syncing ? 'Syncing…' : 'Sync commits'}
        </Button>
      </div>

      <div {...pageTransitionItem('agent-ledger', 1)}>
        {!selectedProject ? (
          <AgentEmpty title="Select a Project first" />
        ) : !github ? (
          <AgentEmpty
            description="Connect a GitHub repository to populate its main-branch commit ledger."
            title="GitHub is not connected"
          />
        ) : (
          <CommitLedger
            key={`${selectedProject._id}-${rowsPerPage}`}
            projectId={selectedProject._id}
            repository={github.externalSlug}
            rowsPerPage={rowsPerPage}
            setRowsPerPage={setRowsPerPage}
            totalRows={totals?.agentCommits ?? 0}
          />
        )}
      </div>
      {syncError ? <p className="mt-3 text-xs text-destructive">{syncError}</p> : null}
    </div>
  )
}

function CommitLedger({
  projectId,
  repository,
  rowsPerPage,
  setRowsPerPage,
  totalRows,
}: {
  projectId: Id<'projects'>
  repository: string
  rowsPerPage: number
  setRowsPerPage: (rows: number) => void
  totalRows: number
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.agentCommits.list,
    { projectId },
    { initialNumItems: rowsPerPage },
  )
  const pagination = usePaginatedLedger({
    loadMore,
    results,
    rowsPerPage,
    status,
  })
  const setComment = useMutation(api.agentCommits.setComment)
  const [selectedCommit, setSelectedCommit] = useState<Commit | null>(null)
  const [comment, setCommentValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openComment(commit: Commit) {
    setSelectedCommit(commit)
    setCommentValue(commit.comment ?? '')
    setError('')
  }

  async function saveComment(event: FormEvent) {
    event.preventDefault()
    if (!selectedCommit) return
    setSaving(true)
    setError('')
    try {
      await setComment({ commitId: selectedCommit._id, comment })
      setSelectedCommit(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save comment')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card className="gap-0 overflow-hidden py-0 shadow-none">
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="text-sm">{repository}</CardTitle>
          <CardDescription className="text-xs">
            Commits reachable from main, newest first
          </CardDescription>
        </CardHeader>
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-14"><span className="sr-only">Tree</span></TableHead>
              <TableHead>Commit</TableHead>
              <TableHead className="hidden w-40 md:table-cell">Author</TableHead>
              <TableHead className="hidden w-44 sm:table-cell">Committed</TableHead>
              <TableHead className="w-36"><span className="sr-only">Comment</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagination.visibleRows.length ? (
              pagination.visibleRows.map((commit) => (
                <TableRow className="group" key={commit._id}>
                  <TableCell className="relative">
                    <span className="absolute inset-y-0 left-7 border-l" aria-hidden="true" />
                    <span className="relative grid size-6 place-items-center rounded-full border bg-background">
                      <GitCommitHorizontal aria-hidden="true" className="size-3.5" />
                    </span>
                  </TableCell>
                  <TableCell>
                    <a
                      className="inline-flex max-w-full items-center gap-1 font-medium hover:underline"
                      href={commit.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="truncate">{commit.title}</span>
                      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                    </a>
                    <div className="mt-1 flex items-center gap-2">
                      <code className="text-xs text-muted-foreground">
                        {commit.sha.slice(0, 7)}
                      </code>
                      {commit.comment ? <Badge variant="secondary">Commented</Badge> : null}
                    </div>
                  </TableCell>
                  <TableCell className="hidden truncate text-muted-foreground md:table-cell">
                    {commit.author}
                  </TableCell>
                  <TableCell className="hidden text-xs text-muted-foreground tabular-nums sm:table-cell">
                    {formatDate(commit.committedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      aria-label={`${commit.comment ? 'Edit' : 'Add'} comment for ${commit.title}`}
                      className="opacity-100 transition-opacity sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100"
                      onClick={() => openComment(commit)}
                      size="sm"
                      variant="ghost"
                    >
                      <MessageSquare data-icon="inline-start" />
                      {commit.comment ? 'Edit' : 'Comment'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell className="h-28 text-center text-muted-foreground" colSpan={5}>
                  {status === 'LoadingFirstPage'
                    ? 'Loading commits…'
                    : 'No main-branch commits synced yet.'}
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

      <Dialog
        open={selectedCommit !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedCommit(null)
        }}
      >
        <DialogContent>
          <form onSubmit={saveComment}>
            <DialogHeader>
              <DialogTitle>Comment on commit</DialogTitle>
              <DialogDescription>
                {selectedCommit?.title} · {selectedCommit?.sha.slice(0, 7)}
              </DialogDescription>
            </DialogHeader>
            <FieldGroup className="py-4">
              <Field data-invalid={Boolean(error)}>
                <FieldLabel htmlFor="agent-commit-comment">Agent guidance</FieldLabel>
                <Textarea
                  aria-invalid={Boolean(error)}
                  id="agent-commit-comment"
                  maxLength={2_000}
                  onChange={(event) => setCommentValue(event.target.value)}
                  placeholder="What should the agent inspect or change?"
                  value={comment}
                />
                <FieldError>{error}</FieldError>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button onClick={() => setSelectedCommit(null)} type="button" variant="outline">
                Cancel
              </Button>
              <Button disabled={saving} type="submit">
                {saving ? 'Saving…' : comment.trim() ? 'Save comment' : 'Clear comment'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function AgentEmpty({
  description,
  title,
}: {
  description?: string
  title: string
}) {
  return (
    <Card className="shadow-none">
      <CardContent>
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{title}</EmptyTitle>
            {description ? <EmptyDescription>{description}</EmptyDescription> : null}
          </EmptyHeader>
        </Empty>
      </CardContent>
    </Card>
  )
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}
