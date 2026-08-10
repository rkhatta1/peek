import { useEffect, useState, type FormEvent } from 'react'
import { Check, ChevronsUpDown, MoreHorizontal, Plus, RefreshCw } from 'lucide-react'

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
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '#/components/ui/command'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '#/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '#/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { cn } from '#/lib/utils'
import {
  useMonitoring,
  useSelectionPageReady,
  type CodeConnection,
  type CodeConnectionConfiguration,
  type ProviderItem,
  type ServiceCredentials,
} from '../monitoring-context'
import { formatDateTime, statusLabel } from '../monitoring-data'
import { pageTransitionItem } from '../page-transition-item'

type Service = ProviderItem['connection']

export function ConnectionsPage() {
  const {
    codeConnections,
    providers,
    selectedProject,
    selectionDataReady,
  } = useMonitoring()
  useSelectionPageReady(
    selectionDataReady,
    selectedProject?._id ?? 'no-project',
  )
  const [connectOpen, setConnectOpen] = useState(false)
  const [codeConnectOpen, setCodeConnectOpen] = useState(false)
  const [editing, setEditing] = useState<Service | null>(null)
  const [rotating, setRotating] = useState<Service | null>(null)
  const [removing, setRemoving] = useState<Service | null>(null)
  const [rotatingCode, setRotatingCode] = useState<CodeConnection | null>(null)
  const [removingCode, setRemovingCode] = useState<CodeConnection | null>(null)

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Connections</h1>
      <div
        {...pageTransitionItem('connections-toolbar', 0)}
        className="mb-4 flex items-center justify-between gap-4"
      >
        <p className="text-xs text-muted-foreground">
          {selectedProject
            ? `Services for ${selectedProject.name}`
            : 'Create a project before connecting services.'}
        </p>
        <div className="flex items-center gap-2">
          <Button
            disabled={!selectedProject || codeConnections.length >= 2}
            onClick={() => setCodeConnectOpen(true)}
            size="sm"
            variant="outline"
          >
            <Plus aria-hidden="true" />
            Add code source
          </Button>
          <Button
            disabled={!selectedProject}
            onClick={() => setConnectOpen(true)}
            size="sm"
          >
            <Plus aria-hidden="true" />
            Add service
          </Button>
        </div>
      </div>

      <Card
        {...pageTransitionItem('connections-table', 1)}
        className="gap-0 overflow-hidden py-0 shadow-none"
      >
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="text-sm">Monitoring services</CardTitle>
          <CardDescription className="text-xs">
            Credentials are encrypted and write-only.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {providers.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead className="hidden md:table-cell">Environment</TableHead>
                  <TableHead className="hidden lg:table-cell">Last sample</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((item) => (
                  <TableRow key={item.connection._id}>
                    <TableCell className="font-medium">
                      {item.connection.name}
                    </TableCell>
                    <TableCell className="capitalize text-muted-foreground">
                      {item.connection.provider}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {item.connection.environment}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                      {formatDateTime(item.latest?.capturedAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        <span
                          className={`size-1.5 rounded-full ${
                            item.connection.active &&
                            item.connection.credentialState === 'valid'
                              ? 'bg-[#557a46]'
                              : 'bg-amber-500'
                          }`}
                          aria-hidden="true"
                        />
                        {item.connection.active ? statusLabel(item) : 'Paused'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ServiceMenu
                        onEdit={() => setEditing(item.connection)}
                        onRemove={() => setRemoving(item.connection)}
                        onRotate={() => setRotating(item.connection)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-64 border-0">
              <EmptyHeader>
                <EmptyTitle>No services connected</EmptyTitle>
                <EmptyDescription>
                  Add Neon Postgres or Upstash Redis to begin collection.
                </EmptyDescription>
              </EmptyHeader>
              {selectedProject ? (
                <Button onClick={() => setConnectOpen(true)} size="sm">
                  Add service
                </Button>
              ) : null}
            </Empty>
          )}
        </CardContent>
      </Card>

      <Card
        {...pageTransitionItem('code-connections-table', 2)}
        className="mt-4 gap-0 overflow-hidden py-0 shadow-none"
      >
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="text-sm">Code attribution</CardTitle>
          <CardDescription className="text-xs">
            Resolve the code and deployment active when a provider event occurred.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {codeConnections.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Repository / project</TableHead>
                  <TableHead className="hidden md:table-cell">Scope</TableHead>
                  <TableHead className="hidden lg:table-cell">Validated</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codeConnections.map((connection) => (
                  <TableRow key={connection._id}>
                    <TableCell className="font-medium capitalize">
                      {connection.provider}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {connection.externalSlug}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {connection.provider === 'github'
                        ? connection.branch
                        : 'main → production'}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                      {formatDateTime(connection.lastValidatedAt)}
                    </TableCell>
                    <TableCell>
                      <CodeConnectionMenu
                        onRemove={() => setRemovingCode(connection)}
                        onRotate={() => setRotatingCode(connection)}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <Empty className="min-h-48 border-0">
              <EmptyHeader>
                <EmptyTitle>No code sources connected</EmptyTitle>
                <EmptyDescription>
                  Add GitHub and Vercel to attribute events to commits, PRs, and
                  deployments.
                </EmptyDescription>
              </EmptyHeader>
              {selectedProject ? (
                <Button onClick={() => setCodeConnectOpen(true)} size="sm">
                  Add code source
                </Button>
              ) : null}
            </Empty>
          )}
        </CardContent>
      </Card>

      <ConnectionDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <CodeConnectionDialog
        connections={codeConnections}
        open={codeConnectOpen}
        onOpenChange={setCodeConnectOpen}
      />
      <CodeConnectionDialog
        key={rotatingCode?._id ?? 'no-code-connection'}
        connection={rotatingCode}
        connections={codeConnections}
        open={Boolean(rotatingCode)}
        onOpenChange={(open) => {
          if (!open) setRotatingCode(null)
        }}
      />
      <ConnectionDialog
        open={Boolean(rotating)}
        onOpenChange={(open) => {
          if (!open) setRotating(null)
        }}
        service={rotating}
      />
      <EditServiceDialog
        key={editing?._id ?? 'no-service'}
        open={Boolean(editing)}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
        service={editing}
      />
      <RemoveServiceDialog
        open={Boolean(removing)}
        onOpenChange={(open) => {
          if (!open) setRemoving(null)
        }}
        service={removing}
      />
      <RemoveCodeConnectionDialog
        connection={removingCode}
        open={Boolean(removingCode)}
        onOpenChange={(open) => {
          if (!open) setRemovingCode(null)
        }}
      />
    </div>
  )
}

function ServiceMenu({
  onEdit,
  onRemove,
  onRotate,
}: {
  onEdit: () => void
  onRemove: () => void
  onRotate: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Service actions" size="icon-sm" variant="ghost">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onEdit}>Edit</DropdownMenuItem>
          <DropdownMenuItem onSelect={onRotate}>Rotate credentials</DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CodeConnectionMenu({
  onRemove,
  onRotate,
}: {
  onRemove: () => void
  onRotate: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="Code connection actions" size="icon-sm" variant="ghost">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem onSelect={onRotate}>Edit connection</DropdownMenuItem>
          <DropdownMenuItem className="text-destructive" onSelect={onRemove}>
            Delete
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function CodeConnectionDialog({
  connection = null,
  connections,
  open,
  onOpenChange,
}: {
  connection?: CodeConnection | null
  connections: CodeConnection[]
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const {
    connectCodeConnection,
    listGitHubBranches,
    selectedProject,
  } = useMonitoring()
  const [provider, setProvider] = useState<'github' | 'vercel'>(
    connection?.provider ?? 'github',
  )
  const [repository, setRepository] = useState(
    connection?.provider === 'github' ? connection.externalSlug : '',
  )
  const [branch, setBranch] = useState(
    connection?.provider === 'github' ? connection.branch : '',
  )
  const [branches, setBranches] = useState<string[]>(
    connection?.provider === 'github' ? [connection.branch] : [],
  )
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [vercelProjectId, setVercelProjectId] = useState(
    connection?.provider === 'vercel' ? connection.externalId : '',
  )
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const availableProviders = connection
    ? [connection.provider]
    : (['github', 'vercel'] as const).filter(
        (candidate) =>
          !connections.some((item) => item.provider === candidate),
      )
  const activeProvider = availableProviders.includes(provider)
    ? provider
    : (availableProviders[0] ?? provider)

  useEffect(() => {
    if (!open || !selectedProject || connection?.provider !== 'github') return
    let ignored = false
    setBranchesLoading(true)
    void listGitHubBranches({
      projectId: selectedProject._id,
      repository: connection.externalSlug,
      connectionId: connection._id,
    })
      .then((items) => {
        if (ignored) return
        setBranches(items)
        setBranch((current) =>
          items.includes(current) ? current : (items[0] ?? ''),
        )
      })
      .catch((cause) => {
        if (!ignored) setError(codeConnectionErrorMessage(cause))
      })
      .finally(() => {
        if (!ignored) setBranchesLoading(false)
      })
    return () => {
      ignored = true
    }
  }, [connection?._id, listGitHubBranches, open, selectedProject?._id])

  async function loadBranches() {
    if (!selectedProject) return
    setBranchesLoading(true)
    setError('')
    try {
      const items = await listGitHubBranches({
        projectId: selectedProject._id,
        repository,
        token: token || undefined,
        connectionId:
          connection?.provider === 'github' ? connection._id : undefined,
      })
      setBranches(items)
      setBranch((current) =>
        items.includes(current) ? current : (items[0] ?? ''),
      )
    } catch (cause) {
      setError(codeConnectionErrorMessage(cause))
    } finally {
      setBranchesLoading(false)
    }
  }

  function close() {
    setRepository('')
    setBranch('')
    setBranches([])
    setVercelProjectId('')
    setToken('')
    setError('')
    onOpenChange(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selectedProject || !availableProviders.length) return
    setSaving(true)
    setError('')
    const configuration: CodeConnectionConfiguration =
      activeProvider === 'github'
        ? {
            provider: 'github',
            repository,
            branch,
            token: token || undefined,
            connectionId:
              connection?.provider === 'github' ? connection._id : undefined,
          }
        : { provider: 'vercel', projectId: vercelProjectId, token }
    try {
      await connectCodeConnection({
        projectId: selectedProject._id,
        configuration,
      })
      close()
    } catch (cause) {
      setError(codeConnectionErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}
    >
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {connection ? 'Edit code connection' : 'Connect code source'}
            </DialogTitle>
            <DialogDescription>
              Peek validates access before encrypting the token. Token values
              are write-only and never returned to the browser.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="code-provider">Provider</Label>
            <Select
              disabled={Boolean(connection)}
              onValueChange={(value) => setProvider(value as 'github' | 'vercel')}
              value={activeProvider}
            >
              <SelectTrigger className="w-full" id="code-provider">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem
                    disabled={!availableProviders.includes('github')}
                    value="github"
                  >
                    GitHub
                  </SelectItem>
                  <SelectItem
                    disabled={!availableProviders.includes('vercel')}
                    value="vercel"
                  >
                    Vercel
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          {activeProvider === 'github' ? (
            <div className="grid gap-2">
              <Label htmlFor="github-repository">Repository</Label>
              <Input
                autoComplete="off"
                id="github-repository"
                onChange={(event) => {
                  setRepository(event.target.value)
                  setBranch('')
                  setBranches([])
                }}
                placeholder="owner/repository"
                required
                value={repository}
              />
              <div className="mt-2 grid gap-2">
                <Label htmlFor="github-branch">Branch</Label>
                <div className="flex gap-2">
                  <BranchCombobox
                    branches={branches}
                    disabled={!branches.length || branchesLoading}
                    onChange={setBranch}
                    value={branch}
                  />
                  <Button
                    aria-label="Load GitHub branches"
                    disabled={
                      branchesLoading ||
                      !repository.trim() ||
                      (!connection && !token.trim())
                    }
                    onClick={() => void loadBranches()}
                    size="icon"
                    type="button"
                    variant="outline"
                  >
                    <RefreshCw
                      aria-hidden="true"
                      className={cn(branchesLoading && 'animate-spin')}
                    />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Switching branches retains earlier history and syncs the selected branch immediately.
                </p>
              </div>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="vercel-project">Vercel project ID or name</Label>
              <Input
                autoComplete="off"
                id="vercel-project"
                onChange={(event) => setVercelProjectId(event.target.value)}
                placeholder="prj_… or project-name"
                required
                value={vercelProjectId}
              />
              <p className="text-xs text-muted-foreground">
                Attribution follows ready production deployments from main.
              </p>
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="code-provider-token">
              {activeProvider === 'github'
                ? 'GitHub access token'
                : 'Vercel access token'}
            </Label>
            <Input
              autoComplete="off"
              id="code-provider-token"
              onChange={(event) => setToken(event.target.value)}
              placeholder={
                connection
                  ? 'Leave blank to keep current token'
                  : activeProvider === 'github'
                    ? 'github_pat_…'
                    : 'vcp_…'
              }
              required={activeProvider === 'vercel' || !connection}
              spellCheck={false}
              type="password"
              value={token}
            />
            <p className="text-xs text-muted-foreground">
              {activeProvider === 'github'
                ? 'Use a fine-grained token with Contents and Pull requests read access to this repository.'
                : 'Use a project-scoped token; no separate Vercel team ID is needed.'}
            </p>
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              disabled={
                saving ||
                !availableProviders.length ||
                (activeProvider === 'github' && !branch)
              }
              type="submit"
            >
              {saving ? 'Validating…' : connection ? 'Save connection' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function BranchCombobox({
  branches,
  disabled,
  onChange,
  value,
}: {
  branches: string[]
  disabled: boolean
  onChange: (branch: string) => void
  value: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          aria-expanded={open}
          className="min-w-0 flex-1 justify-between font-normal"
          disabled={disabled}
          id="github-branch"
          role="combobox"
          type="button"
          variant="outline"
        >
          <span className="truncate">
            {value || (disabled ? 'Load branches first' : 'Select branch')}
          </span>
          <ChevronsUpDown aria-hidden="true" className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-(--radix-popover-trigger-width) p-0"
      >
        <Command>
          <CommandInput placeholder="Search branches…" />
          <CommandList>
            <CommandEmpty>No branch found.</CommandEmpty>
            <CommandGroup>
              {branches.map((item) => (
                <CommandItem
                  key={item}
                  onSelect={() => {
                    onChange(item)
                    setOpen(false)
                  }}
                  value={item}
                >
                  <Check
                    aria-hidden="true"
                    className={cn(item === value ? 'opacity-100' : 'opacity-0')}
                  />
                  <span className="truncate">{item}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

function ConnectionDialog({
  open,
  onOpenChange,
  service = null,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service?: Service | null
}) {
  const { connectService, selectedProject } = useMonitoring()
  const [provider, setProvider] = useState<'neon' | 'upstash'>('neon')
  const [name, setName] = useState('Neon Postgres')
  const [environment, setEnvironment] = useState('Production')
  const [databaseUrl, setDatabaseUrl] = useState('')
  const [email, setEmail] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [databaseId, setDatabaseId] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const activeProvider = service?.provider ?? provider

  function close() {
    setDatabaseUrl('')
    setApiKey('')
    setEmail('')
    setDatabaseId('')
    setError('')
    onOpenChange(false)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!selectedProject) return
    setSaving(true)
    setError('')
    const credentials: ServiceCredentials =
      activeProvider === 'neon'
        ? { provider: 'neon', databaseUrl }
        : { provider: 'upstash', email, apiKey, databaseId }
    try {
      await connectService({
        projectId: selectedProject._id,
        serviceId: service?._id,
        name: service?.name ?? name,
        environment: service?.environment ?? environment,
        credentials,
      })
      close()
    } catch (cause) {
      setError(providerErrorMessage(cause))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => (nextOpen ? onOpenChange(true) : close())}
    >
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {service ? 'Rotate credentials' : 'Connect service'}
            </DialogTitle>
            <DialogDescription>
              Peek validates access before encrypting the credentials.
            </DialogDescription>
          </DialogHeader>

          {!service ? (
            <>
              <div className="grid gap-2">
                <Label htmlFor="service-provider">Provider</Label>
                <Select
                  onValueChange={(value) => {
                    const nextProvider = value as 'neon' | 'upstash'
                    setProvider(nextProvider)
                    setName(
                      nextProvider === 'neon' ? 'Neon Postgres' : 'Upstash Redis',
                    )
                  }}
                  value={provider}
                >
                  <SelectTrigger className="w-full" id="service-provider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="neon">Neon Postgres</SelectItem>
                      <SelectItem value="upstash">Upstash Redis</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="service-name">Name</Label>
                  <Input
                    id="service-name"
                    maxLength={80}
                    onChange={(event) => setName(event.target.value)}
                    required
                    value={name}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="service-environment">Environment</Label>
                  <Input
                    id="service-environment"
                    maxLength={40}
                    onChange={(event) => setEnvironment(event.target.value)}
                    required
                    value={environment}
                  />
                </div>
              </div>
            </>
          ) : null}

          {activeProvider === 'neon' ? (
            <div className="grid gap-2">
              <Label htmlFor="neon-database-url">Database URL</Label>
              <Input
                autoComplete="off"
                id="neon-database-url"
                onChange={(event) => setDatabaseUrl(event.target.value)}
                placeholder="postgresql://user:password@…neon.tech/db?sslmode=require"
                required
                type="password"
                value={databaseUrl}
              />
            </div>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label htmlFor="upstash-email">Upstash account email</Label>
                <Input
                  autoComplete="off"
                  id="upstash-email"
                  onChange={(event) => setEmail(event.target.value)}
                  required
                  type="email"
                  value={email}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label htmlFor="upstash-api-key">Management API key</Label>
                  <Input
                    autoComplete="off"
                    id="upstash-api-key"
                    onChange={(event) => setApiKey(event.target.value)}
                    required
                    type="password"
                    value={apiKey}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="upstash-database-id">Database ID</Label>
                  <Input
                    autoComplete="off"
                    id="upstash-database-id"
                    onChange={(event) => setDatabaseId(event.target.value)}
                    required
                    value={databaseId}
                  />
                </div>
              </div>
            </div>
          )}

          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button disabled={saving} type="submit">
              {saving ? 'Validating…' : service ? 'Rotate' : 'Connect'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: Service | null
}) {
  const { updateService } = useMonitoring()
  const [name, setName] = useState(service?.name ?? '')
  const [environment, setEnvironment] = useState(service?.environment ?? '')
  const [active, setActive] = useState(service?.active ?? true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function initialize() {
    if (!service) return
    setName(service.name)
    setEnvironment(service.environment)
    setActive(service.active)
    setError('')
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!service) return
    setSaving(true)
    setError('')
    try {
      await updateService({
        serviceId: service._id,
        name,
        environment,
        active,
      })
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not update service')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) initialize()
        onOpenChange(nextOpen)
      }}
    >
      <DialogContent>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Edit service</DialogTitle>
            <DialogDescription>
              Rename, change environment, or pause collection.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="edit-service-name">Name</Label>
              <Input
                id="edit-service-name"
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                required
                value={name}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-service-environment">Environment</Label>
              <Input
                id="edit-service-environment"
                maxLength={40}
                onChange={(event) => setEnvironment(event.target.value)}
                required
                value={environment}
              />
            </div>
          </div>
          <div className="flex items-center justify-between gap-4 rounded-md border p-3">
            <Label htmlFor="service-active">Collect metrics</Label>
            <Switch checked={active} id="service-active" onCheckedChange={setActive} />
          </div>
          {error ? <p className="text-xs text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={saving || !name.trim() || !environment.trim()} type="submit">
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RemoveServiceDialog({
  open,
  onOpenChange,
  service,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  service: Service | null
}) {
  const { removeService } = useMonitoring()
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  async function handleRemove() {
    if (!service) return
    setRemoving(true)
    setError('')
    try {
      await removeService(service._id)
      onOpenChange(false)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete service')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {service?.name ?? 'service'}?</DialogTitle>
          <DialogDescription>
            Collection stops immediately. Credentials and metric history are deleted.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={removing} variant="destructive" onClick={handleRemove}>
            {removing ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RemoveCodeConnectionDialog({
  connection,
  open,
  onOpenChange,
}: {
  connection: CodeConnection | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { removeCodeConnection } = useMonitoring()
  const [removing, setRemoving] = useState(false)
  const [error, setError] = useState('')

  async function handleRemove() {
    if (!connection) return
    setRemoving(true)
    setError('')
    try {
      await removeCodeConnection(connection._id)
      onOpenChange(false)
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not delete code source',
      )
    } finally {
      setRemoving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {connection?.name ?? 'code source'}?</DialogTitle>
          <DialogDescription>
            Future event drawers will no longer resolve this source.
          </DialogDescription>
        </DialogHeader>
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={removing} variant="destructive" onClick={handleRemove}>
            {removing ? 'Deleting…' : 'Delete'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function providerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('CREDENTIAL_REJECTED')) return 'Provider rejected these credentials.'
  if (message.includes('PROVIDER_TIMEOUT')) return 'Provider timed out. Try again.'
  if (message.includes('INVALID_CONFIGURATION')) return 'Check the provider details and try again.'
  if (message.includes('COLLECTION_FAILED')) return 'Provider validation failed.'
  return 'Could not connect service.'
}

function codeConnectionErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (message.includes('CREDENTIAL_REJECTED')) {
    return 'The provider rejected this token.'
  }
  if (message.includes('RESOURCE_NOT_FOUND')) {
    return 'The repository or project was not found.'
  }
  if (message.includes('INVALID_CONFIGURATION')) {
    return 'Check the repository or project identifier and token.'
  }
  return 'Could not connect code source.'
}
