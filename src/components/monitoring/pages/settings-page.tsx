import { useEffect, useState, type FormEvent } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'

import { api } from '../../../../convex/_generated/api'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { Switch } from '#/components/ui/switch'
import { useTheme } from '#/hooks/use-theme'
import { useMonitoring } from '../monitoring-context'
import { pageTransitionItem } from '../page-transition-item'

export function SettingsPage() {
  const {
    removeClient,
    removeProject,
    selectedClient,
    selectedProject,
    updateClient,
    updateProject,
  } = useMonitoring()
  const { theme, setTheme } = useTheme()
  const [clientName, setClientName] = useState(selectedClient?.name ?? '')
  const [projectName, setProjectName] = useState(selectedProject?.name ?? '')
  const [saving, setSaving] = useState<'client' | 'project' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<'client' | 'project' | null>(
    null,
  )
  const [error, setError] = useState('')
  const agentSettings = useQuery(
    api.agentApi.getSettings,
    selectedProject ? { projectId: selectedProject._id } : 'skip',
  )
  const rotateAgentToken = useAction(api.agentApiActions.rotateToken)
  const updateAgentComment = useMutation(api.agentApi.updateComment)
  const revokeAgentToken = useMutation(api.agentApi.revokeToken)
  const [agentComment, setAgentComment] = useState('')
  const [agentSaving, setAgentSaving] = useState<
    'comment' | 'token' | 'revoke' | null
  >(null)
  const [agentError, setAgentError] = useState('')
  const [newAgentToken, setNewAgentToken] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => setClientName(selectedClient?.name ?? ''), [selectedClient])
  useEffect(() => setProjectName(selectedProject?.name ?? ''), [selectedProject])
  useEffect(() => {
    setAgentComment(agentSettings?.comment ?? '')
  }, [agentSettings?.comment, selectedProject?._id])
  useEffect(() => {
    setNewAgentToken('')
    setCopied(false)
  }, [selectedProject?._id])

  async function saveClient(event: FormEvent) {
    event.preventDefault()
    if (!selectedClient) return
    setSaving('client')
    setError('')
    try {
      await updateClient(selectedClient._id, clientName)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(null)
    }
  }

  async function saveProject(event: FormEvent) {
    event.preventDefault()
    if (!selectedProject) return
    setSaving('project')
    setError('')
    try {
      await updateProject(selectedProject._id, projectName)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(null)
    }
  }

  async function confirmDelete() {
    setDeleting(true)
    setError('')
    try {
      if (deleteTarget === 'project' && selectedProject) {
        await removeProject(selectedProject._id)
      }
      if (deleteTarget === 'client' && selectedClient) {
        await removeClient(selectedClient._id)
      }
      setDeleteTarget(null)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setDeleting(false)
    }
  }

  async function saveAgentComment(event: FormEvent) {
    event.preventDefault()
    if (!selectedProject) return
    setAgentSaving('comment')
    setAgentError('')
    try {
      await updateAgentComment({
        projectId: selectedProject._id,
        comment: agentComment,
      })
    } catch (cause) {
      setAgentError(errorMessage(cause))
    } finally {
      setAgentSaving(null)
    }
  }

  async function createOrRotateAgentToken() {
    if (!selectedProject) return
    setAgentSaving('token')
    setAgentError('')
    setCopied(false)
    try {
      const result = await rotateAgentToken({ projectId: selectedProject._id })
      setNewAgentToken(result.token)
    } catch (cause) {
      setAgentError(errorMessage(cause))
    } finally {
      setAgentSaving(null)
    }
  }

  async function revokeCurrentAgentToken() {
    if (!selectedProject) return
    setAgentSaving('revoke')
    setAgentError('')
    try {
      await revokeAgentToken({ projectId: selectedProject._id })
      setNewAgentToken('')
      setCopied(false)
    } catch (cause) {
      setAgentError(errorMessage(cause))
    } finally {
      setAgentSaving(null)
    }
  }

  async function copyAgentToken() {
    if (!newAgentToken) return
    try {
      await navigator.clipboard.writeText(newAgentToken)
      setCopied(true)
    } catch {
      setAgentError('Could not copy the token')
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Settings</h1>
      <div className="grid gap-4">
        <Card {...pageTransitionItem('settings-client', 0)} className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Client</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedClient ? (
              <form className="flex items-end gap-3" onSubmit={saveClient}>
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="client-name">Name</Label>
                  <Input
                    id="client-name"
                    maxLength={80}
                    onChange={(event) => setClientName(event.target.value)}
                    required
                    value={clientName}
                  />
                </div>
                <Button
                  disabled={
                    saving === 'client' ||
                    !clientName.trim() ||
                    clientName.trim() === selectedClient.name
                  }
                  type="submit"
                  variant="outline"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteTarget('client')}
                >
                  Delete
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">No client selected.</p>
            )}
          </CardContent>
        </Card>

        <Card {...pageTransitionItem('settings-project', 1)} className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Project</CardTitle>
          </CardHeader>
          <CardContent>
            {selectedProject ? (
              <form className="flex items-end gap-3" onSubmit={saveProject}>
                <div className="grid flex-1 gap-2">
                  <Label htmlFor="project-name">Name</Label>
                  <Input
                    id="project-name"
                    maxLength={80}
                    onChange={(event) => setProjectName(event.target.value)}
                    required
                    value={projectName}
                  />
                </div>
                <Button
                  disabled={
                    saving === 'project' ||
                    !projectName.trim() ||
                    projectName.trim() === selectedProject.name
                  }
                  type="submit"
                  variant="outline"
                >
                  Save
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => setDeleteTarget('project')}
                >
                  Delete
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
            {error ? <p className="mt-2 text-xs text-destructive">{error}</p> : null}
          </CardContent>
        </Card>

        <Card {...pageTransitionItem('settings-agent-api', 2)} className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Agent API</CardTitle>
            <CardDescription>
              Let an AI agent report Project activity and read your current
              instruction over authenticated HTTP.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            {selectedProject ? (
              <>
                <div className="flex flex-col gap-2">
                  <p className="text-sm font-medium">Endpoints</p>
                  <code className="break-all rounded-md bg-muted px-3 py-2 text-xs">
                    GET {agentApiBaseUrl}/status
                  </code>
                  <code className="break-all rounded-md bg-muted px-3 py-2 text-xs">
                    POST {agentApiBaseUrl}/events
                  </code>
                </div>

                <form className="flex items-end gap-3" onSubmit={saveAgentComment}>
                  <div className="grid flex-1 gap-2">
                    <Label htmlFor="agent-status-comment">Status comment</Label>
                    <Input
                      id="agent-status-comment"
                      maxLength={2_000}
                      onChange={(event) => setAgentComment(event.target.value)}
                      placeholder="e.g. Pause before deployment."
                      value={agentComment}
                    />
                  </div>
                  <Button
                    disabled={
                      agentSaving === 'comment' ||
                      agentSettings === undefined ||
                      agentComment.trim() === agentSettings.comment
                    }
                    type="submit"
                    variant="outline"
                  >
                    {agentSaving === 'comment' ? 'Saving…' : 'Save comment'}
                  </Button>
                </form>

                {newAgentToken ? (
                  <Alert>
                    <AlertTitle>Copy this token now</AlertTitle>
                    <AlertDescription>
                      <p>Peek stores only its hash. It will not be shown again.</p>
                      <div className="flex w-full gap-2">
                        <Input
                          aria-label="New Agent API token"
                          className="min-w-0 flex-1 font-mono"
                          readOnly
                          value={newAgentToken}
                        />
                        <Button onClick={copyAgentToken} type="button" variant="outline">
                          {copied ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    </AlertDescription>
                  </Alert>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  {agentSettings?.token
                    ? `Active token ending ${agentSettings.token.hint} · created ${formatDate(agentSettings.token.createdAt)}`
                    : 'No active Agent API token.'}
                </p>
                {agentError ? (
                  <p className="text-xs text-destructive">{agentError}</p>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No project selected.</p>
            )}
          </CardContent>
          {selectedProject ? (
            <CardFooter className="gap-2">
              <Button
                disabled={agentSaving !== null}
                onClick={createOrRotateAgentToken}
                type="button"
              >
                {agentSaving === 'token'
                  ? 'Generating…'
                  : agentSettings?.token
                    ? 'Rotate token'
                    : 'Create token'}
              </Button>
              {agentSettings?.token ? (
                <Button
                  disabled={agentSaving !== null}
                  onClick={revokeCurrentAgentToken}
                  type="button"
                  variant="destructive"
                >
                  {agentSaving === 'revoke' ? 'Revoking…' : 'Revoke token'}
                </Button>
              ) : null}
            </CardFooter>
          ) : null}
        </Card>

        <Card
          {...pageTransitionItem('settings-preferences', 3)}
          className="shadow-none"
        >
          <CardHeader>
            <CardTitle className="text-sm">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="dark-mode">Dark mode</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved on this device.
                </p>
              </div>
              <Switch
                checked={theme === 'dark'}
                id="dark-mode"
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Collection interval</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Every 15 minutes
                </p>
              </div>
              <Button disabled size="sm" variant="outline">
                Managed
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {deleteTarget === 'client' ? selectedClient?.name : selectedProject?.name}?
            </DialogTitle>
            <DialogDescription>
              {deleteTarget === 'client'
                ? 'All projects, connected services, credentials, Agent API access, events, and metric history for this client will be deleted.'
                : 'Connected services, credentials, Agent API access, events, and metric history for this project will be deleted.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button disabled={deleting} variant="destructive" onClick={confirmDelete}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not save changes'
}

function formatDate(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(timestamp)
}

function convexSiteUrl() {
  const explicit = import.meta.env.VITE_CONVEX_SITE_URL?.replace(/\/$/, '')
  if (explicit) return explicit
  return import.meta.env.VITE_CONVEX_URL?.replace(/\.convex\.cloud\/?$/, '.convex.site') ?? ''
}

const agentApiBaseUrl = convexSiteUrl()
