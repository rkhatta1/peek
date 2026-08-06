import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { ComponentProps } from 'react'
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'

import { Badge } from '#/components/ui/badge'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { cn } from '#/lib/utils'
import type { ProviderItem } from './monitoring-context'
import {
  buildCheckRows,
  formatBytes,
  formatTime,
  statusLabel,
  type CheckRow,
} from './monitoring-data'

const chartConfig = {
  value: { label: 'Cache hit ratio', color: 'var(--foreground)' },
} satisfies ChartConfig

const demoSeries = [96.1, 96.4, 97, 96.8, 97.2, 97.5, 97.1, 97.8, 97.6, 98, 97.9, 98.2]
  .map((value, index) => ({ time: `${11 - index}h`, value }))

type ProviderCardProps = Omit<ComponentProps<typeof Card>, 'children'> & {
  item: ProviderItem
}

export function ProviderCard({ className, item, ...props }: ProviderCardProps) {
  const latest = item.latest
  const isNeon = item.connection.provider === 'neon'
  const chartData = item.history.length
    ? item.history.map((point) => ({
        time: formatTime(point.capturedAt),
        value: Number(((point.cacheHitRatio ?? 0) * 100).toFixed(1)),
      }))
    : demoSeries
  const attention = item.evaluation?.status !== 'operational' && item.connection.mode !== 'demo'

  return (
    <Card
      className={cn('gap-0 overflow-hidden py-0 shadow-none', className)}
      {...props}
    >
      <CardHeader className="border-b px-5 py-4">
        <div className="min-w-0">
          <CardTitle className="truncate text-sm">{item.connection.name}</CardTitle>
          <CardDescription className="mt-1 truncate text-xs capitalize">
            {item.connection.provider === 'neon' ? 'Neon Postgres' : 'Upstash Redis'} · {item.connection.environment}
          </CardDescription>
        </div>
        <CardAction>
          <Badge
            variant="outline"
            className={attention ? 'border-amber-400/50 bg-amber-500/10 text-amber-700 dark:text-amber-300' : ''}
          >
            <span
              aria-hidden="true"
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
            value={isNeon ? String(latest?.connections ?? 1) : String(latest?.requestCount ?? 17)}
          />
          <Metric
            label={isNeon ? 'Database size' : 'Storage'}
            value={formatBytes(isNeon ? latest?.logicalSizeBytes ?? 30_900_000 : latest?.storageBytes ?? 73)}
          />
        </div>
        <div className="px-3 pb-2 pt-5">
          <ChartContainer config={chartConfig} className="aspect-auto h-44 w-full">
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
      <p className="mt-1 truncate text-sm font-medium tabular-nums">{value}</p>
    </div>
  )
}

export function ChecksTable({
  providers,
  rows = buildCheckRows(providers),
  compact = false,
}: {
  providers: ProviderItem[]
  rows?: CheckRow[]
  compact?: boolean
}) {
  return (
    <Card className="gap-0 overflow-hidden py-0 shadow-none">
      {!compact ? (
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="text-sm">Checks</CardTitle>
          <CardDescription className="text-xs">Latest evidence for the selected projects</CardDescription>
        </CardHeader>
      ) : null}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Status</TableHead>
            <TableHead>Check</TableHead>
            <TableHead className="hidden lg:table-cell">Project</TableHead>
            <TableHead className="hidden md:table-cell">Provider</TableHead>
            <TableHead className="text-right">Observed</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length ? rows.map((row) => (
            <TableRow key={row.id}>
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
              <TableCell className="hidden max-w-44 truncate text-muted-foreground lg:table-cell">
                {row.project}
              </TableCell>
              <TableCell className="hidden capitalize text-muted-foreground md:table-cell">
                {row.provider}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
                {formatTime(row.observedAt)}
              </TableCell>
            </TableRow>
          )) : (
            <TableRow>
              <TableCell className="h-28 text-center text-muted-foreground" colSpan={5}>
                No checks in this view.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Card>
  )
}
