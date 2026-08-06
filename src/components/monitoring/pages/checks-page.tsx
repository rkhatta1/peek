import { useMemo } from 'react'

import { Badge } from '#/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { useMonitoring } from '../monitoring-context'
import { buildCheckRows } from '../monitoring-data'
import { ChecksTable } from '../monitoring-panels'
import { pageTransitionItem } from '../page-transition-item'

export function ChecksPage() {
  const { providers } = useMonitoring()
  const rows = useMemo(() => buildCheckRows(providers), [providers])
  const attentionRows = rows.filter((row) => row.severity !== 'info')

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Checks</h1>
      <Tabs defaultValue="all">
        <div
          {...pageTransitionItem('checks-toolbar', 0)}
          className="mb-4 flex items-center justify-between gap-3"
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="attention">
              Attention
              {attentionRows.length ? (
                <Badge className="ml-1 h-5 min-w-5 px-1.5" variant="secondary">
                  {attentionRows.length}
                </Badge>
              ) : null}
            </TabsTrigger>
          </TabsList>
          <p className="text-xs text-muted-foreground tabular-nums">
            {rows.length} {rows.length === 1 ? 'check' : 'checks'}
          </p>
        </div>
        <TabsContent {...pageTransitionItem('checks-all', 1)} value="all">
          <ChecksTable compact providers={providers} rows={rows} />
        </TabsContent>
        <TabsContent {...pageTransitionItem('checks-attention', 1)} value="attention">
          <ChecksTable compact providers={providers} rows={attentionRows} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
