import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '#/components/ui/popover'
import { useMonitoring } from './monitoring-context'

export function ClientSwitcher() {
  const [open, setOpen] = useState(false)
  const { overview } = useMonitoring()
  const name = overview.workspace.name

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-label="Select client"
          className="ml-10 h-8 max-w-28 justify-between gap-2 px-2 text-xs sm:max-w-52 md:ml-0"
          variant="ghost"
        >
          <span className="truncate">{name}</span>
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
              <CommandItem onSelect={() => setOpen(false)} value={name}>
                <span className="grid size-7 shrink-0 place-items-center rounded-md bg-foreground text-[10px] font-semibold text-background">
                  {name.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs font-medium">
                  {name}
                </span>
                <Check className="size-4" aria-label="Selected" />
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
