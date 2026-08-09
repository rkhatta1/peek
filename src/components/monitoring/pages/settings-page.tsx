import { useEffect, useState, type FormEvent } from 'react'

import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
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

  useEffect(() => setClientName(selectedClient?.name ?? ''), [selectedClient])
  useEffect(() => setProjectName(selectedProject?.name ?? ''), [selectedProject])

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

        <Card
          {...pageTransitionItem('settings-preferences', 2)}
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
                ? 'All projects, connected services, credentials, and metric history for this client will be deleted.'
                : 'Connected services, credentials, and metric history for this project will be deleted.'}
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
