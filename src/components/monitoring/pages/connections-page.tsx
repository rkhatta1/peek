import { ExternalLink } from 'lucide-react'

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '#/components/ui/table'
import { useMonitoring } from '../monitoring-context'
import { formatDateTime, statusLabel } from '../monitoring-data'
import { pageTransitionItem } from '../page-transition-item'

export function ConnectionsPage() {
  const { providers } = useMonitoring()

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Connections</h1>
      <div
        {...pageTransitionItem('connections-toolbar', 0)}
        className="mb-4 flex items-center justify-between gap-4"
      >
        <p className="text-xs text-muted-foreground">
          Credentials stay in the collector environment.
        </p>
        <Button asChild size="sm" variant="outline">
          <a href="https://dashboard.convex.dev" target="_blank" rel="noreferrer">
            Convex
            <ExternalLink aria-hidden="true" />
          </a>
        </Button>
      </div>

      <Card
        {...pageTransitionItem('connections-table', 1)}
        className="gap-0 overflow-hidden py-0 shadow-none"
      >
        <CardHeader className="border-b px-5 py-4">
          <CardTitle className="text-sm">Provider connections</CardTitle>
          <CardDescription className="text-xs">Read-only monitoring access</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="hidden md:table-cell">Environment</TableHead>
                <TableHead className="hidden lg:table-cell">Last sample</TableHead>
                <TableHead className="text-right">State</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {providers.map((item) => (
                <TableRow key={item.connection._id}>
                  <TableCell className="font-medium">{item.connection.name}</TableCell>
                  <TableCell className="capitalize text-muted-foreground">
                    {item.connection.provider}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {item.connection.environment}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground tabular-nums lg:table-cell">
                    {formatDateTime(item.latest?.capturedAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="outline">
                      <span className="size-1.5 rounded-full bg-[#557a46]" aria-hidden="true" />
                      {statusLabel(item)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
