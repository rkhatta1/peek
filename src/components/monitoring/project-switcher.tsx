import { useState } from 'react'
import { Check, ChevronsUpDown, Layers3 } from 'lucide-react'

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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { useMonitoring } from './monitoring-context'

export function ProjectSwitcher() {
  const [open, setOpen] = useState(false)
  const {
    overview,
    selectedProjectId,
    setSelectedProjectId,
  } = useMonitoring()
  const selected = overview.providers.find(
    (item) => item.connection._id === selectedProjectId,
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Select project"
          className="h-8 max-w-28 justify-between gap-2 px-2 text-xs sm:max-w-60"
          variant="ghost"
        >
          <span className="truncate">
            {selected?.connection.name ?? 'All Projects'}
          </span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput autoComplete="off" placeholder="Find project…" />
          <CommandList>
            <CommandEmpty>No projects found.</CommandEmpty>
            <CommandGroup>
              <ProjectItem
                active={selectedProjectId === 'all'}
                label="All Projects"
                meta={`${overview.providers.length} ${overview.providers.length === 1 ? 'connection' : 'connections'}`}
                onSelect={() => {
                  setSelectedProjectId('all')
                  setOpen(false)
                }}
                value="all-projects"
              />
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup heading={overview.workspace.name}>
              {overview.providers.map((item) => (
                <ProjectItem
                  active={selectedProjectId === item.connection._id}
                  key={item.connection._id}
                  label={item.connection.name}
                  meta={`${item.connection.environment} · ${item.connection.provider}`}
                  onSelect={() => {
                    setSelectedProjectId(item.connection._id)
                    setOpen(false)
                  }}
                  value={`${item.connection.name} ${item.connection.provider} ${item.connection.environment}`}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ProjectItem({
  active,
  label,
  meta,
  onSelect,
  value,
}: {
  active: boolean
  label: string
  meta: string
  onSelect: () => void
  value: string
}) {
  return (
    <CommandItem onSelect={onSelect} value={value}>
      <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-muted/50">
        <Layers3 className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{label}</span>
        <span className="block truncate text-[11px] capitalize text-muted-foreground">
          {meta}
        </span>
      </span>
      {active ? <Check className="size-4" aria-label="Selected" /> : null}
    </CommandItem>
  )
}
