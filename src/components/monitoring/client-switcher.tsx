import { useState, type FormEvent } from 'react'
import { Check, ChevronsUpDown, Plus } from 'lucide-react'

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

export function ClientSwitcher() {
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const { clients, createClient, selectedClient, setSelectedClientId } =
    useMonitoring()

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await createClient(name)
      setName('')
      setCreateOpen(false)
    } catch (cause) {
      setError(errorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-label="Select client"
            className="ml-10 h-8 max-w-28 justify-between gap-2 px-2 text-xs sm:max-w-52 md:ml-0"
            variant="ghost"
          >
            <span className="truncate">{selectedClient?.name ?? 'Add client'}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[min(18rem,calc(100vw-2rem))] p-0"
        >
          <Command>
            <CommandInput autoComplete="off" placeholder="Find client…" />
            <CommandList>
              <CommandEmpty>No clients found.</CommandEmpty>
              <CommandGroup heading="Clients">
                {clients.map((client) => (
                  <CommandItem
                    key={client._id}
                    onSelect={() => {
                      setSelectedClientId(client._id)
                      setOpen(false)
                    }}
                    value={client.name}
                  >
                    <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-[10px] font-semibold text-background">
                      {client.name.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {client.name}
                    </span>
                    {selectedClient?._id === client._id ? (
                      <Check className="size-4" aria-label="Selected" />
                    ) : null}
                  </CommandItem>
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
                  New client
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
              <DialogTitle>New client</DialogTitle>
              <DialogDescription>
                Add the customer organization that owns the projects.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-2">
              <Label htmlFor="new-client-name">Name</Label>
              <Input
                autoFocus
                id="new-client-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder="Acme"
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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not create client'
}
