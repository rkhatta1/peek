import { useEffect, useMemo, useState } from 'react'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Clock3,
  Database,
  LoaderCircle,
  RefreshCw,
  Server,
} from 'lucide-react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { api } from '../../../convex/_generated/api'
import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '#/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '#/components/ui/chart'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Separator } from '#/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { AppSidebar } from './app-sidebar'

type Overview = NonNullable<FunctionReturnType<typeof api.monitoring.getOverview>>
type ProviderItem = Overview['providers'][number]

const chartConfig = {
  value: { label: 'Cache hit ratio', color: 'var(--foreground)' },
} satisfies ChartConfig

const demoBase = Date.now() - 11 * 60 * 60 * 1000
const demoSeries = Array.from({ length: 12 }, (_, index) => ({
  capturedAt: demoBase + index * 60 * 60 * 1000,
  cacheHitRatio: 0.96 + Math.sin(index / 2) * 0.012,
}))

function formatBytes(value = 0) {
  if (value < 1024) return `${value} B`
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`
  return `${(value / 1024 ** 3).toFixed(1)} GB`
}

function formatTime(value?: number) {
  if (!value) return 'Not collected yet'
  return new Intl.DateTimeFormat('en', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(value)
}

function statusLabel(item: ProviderItem) {
  if (item.connection.mode === 'demo') return 'Demo'
  return item.evaluation?.status === 'operational' ? 'Operational' : 'Attention'
}

function ProviderCard({ item }: { item: ProviderItem }) {
  const latest = item.latest
  const isNeon = item.connection.provider === 'neon'
  const chartData = (item.history.length ? item.history : demoSeries).map(
    (point) => ({
      time: formatTime(point.capturedAt),
      value: Number(((point.cacheHitRatio ?? 0) * 100).toFixed(1)),
    }),
  )
  const attention = item.evaluation && item.evaluation.status !== 'operational'

  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-lg border bg-muted/50">
            {isNeon ? <Database className="size-4" /> : <Server className="size-4" />}
          </span>
          <div>
            <CardTitle className="text-sm">{item.connection.name}</CardTitle>
            <CardDescription className="mt-1 text-xs">
              {item.connection.provider === 'neon' ? 'Neon Postgres' : 'Upstash Redis'} · {item.connection.environment}
            </CardDescription>
          </div>
        </div>
        <CardAction>
          <Badge
            variant="outline"
            className={attention ? 'border-amber-300 bg-amber-50 text-amber-800' : ''}
          >
            <span
              className={`size-1.5 rounded-full ${attention ? 'bg-amber-500' : 'bg-[#557a46]'}`}
            />
            {statusLabel(item)}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="p-0">
        <div className="grid grid-cols-3 divide-x border-b">
          <Metric
            label="Cache hit"
            value={latest ? `${(latest.cacheHitRatio * 100).toFixed(1)}%` : '96.8%'}
          />
          <Metric
            label={isNeon ? 'Connections' : 'Requests'}
            value={
              isNeon
                ? String(latest?.connections ?? 1)
                : String(latest?.requestCount ?? 17)
            }
          />
          <Metric
            label={isNeon ? 'Database size' : 'Storage'}
            value={formatBytes(
              isNeon ? latest?.logicalSizeBytes ?? 30_900_000 : latest?.storageBytes ?? 73,
            )}
          />
        </div>
        <div className="px-3 pb-2 pt-5">
          <ChartContainer config={chartConfig} className="h-44 w-full aspect-auto">
            <LineChart accessibilityLayer data={chartData} margin={{ left: 4, right: 12 }}>
              <CartesianGrid vertical={false} strokeDasharray="2 4" />
              <XAxis dataKey="time" tickLine={false} axisLine={false} minTickGap={28} />
              <YAxis domain={[90, 100]} hide />
              <ChartTooltip content={<ChartTooltipContent hideLabel />} />
              <Line
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartContainer>
        </div>
      </CardContent>
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 px-4 py-4">
      <p className="truncate text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-sm font-medium tabular-nums">{value}</p>
    </div>
  )
}

function ChecksTable({ providers }: { providers: Overview['providers'] }) {
  const rows = providers.flatMap((item) => {
    const signals = item.evaluation?.signals ?? []
    if (signals.length) {
      return signals.map((signal) => ({
        provider: item.connection.provider,
        title: signal.title,
        detail: signal.detail,
        severity: signal.severity,
        time: formatTime(item.latest?.capturedAt),
      }))
    }
    return [
      {
        provider: item.connection.provider,
        title: item.connection.mode === 'demo' ? 'Demo connection ready' : 'All checks passed',
        detail:
          item.connection.mode === 'demo'
            ? 'Add provider credentials in Convex to begin live collection.'
            : 'No threshold violations in the latest snapshot.',
        severity: 'info',
        time: formatTime(item.latest?.capturedAt),
      },
    ]
  })

  return (
    <Card className="gap-0 py-0 shadow-none">
      <CardHeader className="border-b px-5 py-4">
        <CardTitle className="text-sm">Recent checks</CardTitle>
        <CardDescription className="text-xs">Latest evidence across all connections</CardDescription>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Check</TableHead>
            <TableHead className="hidden md:table-cell">Provider</TableHead>
            <TableHead className="text-right">Observed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, index) => (
            <TableRow key={`${row.provider}-${row.title}-${index}`}>
              <TableCell>
                {row.severity === 'info' ? (
                  <CheckCircle2 className="size-4 text-[#557a46]" aria-label="Passing" />
                ) : (
                  <AlertTriangle className="size-4 text-amber-600" aria-label="Attention" />
                )}
              </TableCell>
              <TableCell>
                <p className="font-medium">{row.title}</p>
                <p className="mt-0.5 max-w-xl text-xs text-muted-foreground">{row.detail}</p>
              </TableCell>
              <TableCell className="hidden capitalize text-muted-foreground md:table-cell">
                {row.provider}
              </TableCell>
              <TableCell className="text-right font-mono text-xs text-muted-foreground">
                {row.time}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

export function MonitoringDashboard({
  user,
}: {
  user: { name: string; email: string }
}) {
  const { isAuthenticated } = useConvexAuth()
  const overview = useQuery(
    api.monitoring.getOverview,
    isAuthenticated ? {} : 'skip',
  )
  const ensureWorkspace = useMutation(api.monitoring.ensureWorkspace)
  const refreshNow = useAction(api.collectors.refreshNow)
  const [refreshing, setRefreshing] = useState(false)
  const [optimisticCheckedAt, setOptimisticCheckedAt] = useState<number | null>(null)

  useEffect(() => {
    if (overview === null) void ensureWorkspace()
  }, [ensureWorkspace, overview])

  const hasDemo = useMemo(
    () => overview?.providers.some((item) => item.connection.mode === 'demo') ?? false,
    [overview],
  )

  async function refresh() {
    setRefreshing(true)
    setOptimisticCheckedAt(Date.now())
    try {
      await refreshNow()
    } finally {
      setRefreshing(false)
    }
  }

  if (overview === undefined || overview === null) {
    return (
      <main id="main-content" className="grid min-h-svh place-items-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" />
          Preparing workspace
        </div>
      </main>
    )
  }

  const checkedAt =
    optimisticCheckedAt ??
    Math.max(0, ...overview.providers.map((item) => item.latest?.capturedAt ?? 0))

  return (
    <SidebarProvider>
      <AppSidebar user={user} />
      <SidebarInset>
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="h-4" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">Client infrastructure</p>
          </div>
          <Select defaultValue="all">
            <SelectTrigger className="hidden w-44 sm:flex" aria-label="Environment">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All environments</SelectItem>
              <SelectItem value="production">Production</SelectItem>
              <SelectItem value="staging">Staging</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </header>

        <main id="main-content" className="mx-auto w-full max-w-[1480px] flex-1 p-4 md:p-6 lg:p-8">
          <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Overview</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-[-0.035em]">Systems at a glance</h1>
              <p className="mt-2 text-sm text-muted-foreground">Operational evidence from the infrastructure your clients depend on.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock3 className="size-3.5" />
              {checkedAt ? `Checked ${formatTime(checkedAt)}` : 'Awaiting first collection'}
            </div>
          </div>

          {hasDemo ? (
            <Alert className="mb-5 border-amber-200 bg-amber-50/70 text-amber-950">
              <AlertTriangle />
              <AlertTitle>Demo data</AlertTitle>
              <AlertDescription className="text-amber-900/70">
                Provider credentials are not configured in Convex yet. The interface is showing clearly labeled representative data.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            {overview.providers.map((item) => (
              <ProviderCard key={item.connection._id} item={item} />
            ))}
          </div>

          <section className="mt-4">
            <ChecksTable providers={overview.providers} />
          </section>

          <a
            href="https://dashboard.convex.dev"
            target="_blank"
            rel="noreferrer"
            className="mt-5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Manage collection environment <ArrowUpRight className="size-3" />
          </a>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
