import { useState, type FormEvent } from 'react'
import { Check, ChevronsUpDown, Layers3, Plus } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '#/components/ui/command'
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { useMonitoring } from './monitoring-context'

export function ProjectSwitcher() {
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const {
    createProject,
    projects,
    selectedClient,
    selectedProject,
    setSelectedProjectId,
  } = useMonitoring()

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    if (!selectedClient) return
    setSaving(true)
    setError('')
    try {
      await createProject(selectedClient._id, name)
      setName('')
      setCreateOpen(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create project')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label="Select project"
            className="h-8 max-w-28 justify-between gap-2 px-2 text-xs sm:max-w-60"
            disabled={!selectedClient}
            variant="ghost"
          >
            <span className="truncate">{selectedProject?.name ?? 'Add project'}</span>
            <ChevronsUpDown className="size-3.5 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(22rem,calc(100vw-2rem))] p-0"
        >
          <Command>
            <CommandInput autoComplete="off" placeholder="Find project…" />
            <CommandList>
              <CommandEmpty>No projects found.</CommandEmpty>
              <CommandGroup heading={selectedClient?.name ?? 'Projects'}>
                {projects.map((project) => (
                  <ProjectItem
                    active={selectedProject?._id === project._id}
                    key={project._id}
                    label={project.name}
                    onSelect={() => {
                      setSelectedProjectId(project._id)
                      setOpen(false)
                    }}
                    value={project.name}
                  />
                ))}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <CommandItem
                  onSelect={() => {
                    setOpen(false)
                    setCreateOpen(true)
                  }}
                >
                  <Plus aria-hidden="true" />
                  New project
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form className="grid gap-4" onSubmit={handleCreate}>
            <DialogHeader>
              <DialogTitle>New project</DialogTitle>
              <DialogDescription>
                One app belonging to {selectedClient?.name ?? 'this client'}.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-project-name">Name</Label>
              <Input
                autoFocus
                id="new-project-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Production app"
                required
                value={name}
              />
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button disabled={saving || !name.trim()} type="submit">
                {saving ? 'Creating…' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ProjectItem({
  active,
  label,
  onSelect,
  value,
}: {
  active: boolean
  label: string
  onSelect: () => void
  value: string
}) {
  return (
    <CommandItem onSelect={onSelect} value={value}>
      <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted/50">
        <Layers3 className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-xs font-medium">{label}</span>
      {active ? <Check className="size-4" aria-label="Selected" /> : null}
    </CommandItem>
  )
}
