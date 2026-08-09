import { useMemo, useState } from 'react'

import { AnimatedBackground } from '#/components/motion-primitives/animated-background'
import { Badge } from '#/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#/components/ui/tabs'
import { CheckEventsTable } from '../check-events-table'
import { useMonitoring } from '../monitoring-context'
import { buildCheckRows } from '../monitoring-data'
import { pageTransitionItem } from '../page-transition-item'

export function ChecksPage() {
  const { providers } = useMonitoring()
  const [activeTab, setActiveTab] = useState('all')
  const rows = useMemo(() => buildCheckRows(providers), [providers])
  const attentionRows = rows.filter((row) => row.severity !== 'info')

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Checks</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div
          {...pageTransitionItem('checks-toolbar', 0)}
          className="mb-4"
        >
          <TabsList>
            <AnimatedBackground
              className="rounded-md border bg-background shadow-sm dark:border-input dark:bg-input/30"
              defaultValue={activeTab}
              transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
            >
              <TabsTrigger
                className="data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
                data-id="all"
                value="all"
              >
                <span className="flex items-center gap-1.5">All</span>
              </TabsTrigger>
              <TabsTrigger
                className="data-[state=active]:border-transparent data-[state=active]:bg-transparent data-[state=active]:shadow-none dark:data-[state=active]:bg-transparent"
                data-id="attention"
                value="attention"
              >
                <span className="flex items-center gap-1.5">
                  Attention
                  {attentionRows.length ? (
                    <Badge className="h-5 min-w-5 px-1.5" variant="secondary">
                      {attentionRows.length}
                    </Badge>
                  ) : null}
                </span>
              </TabsTrigger>
            </AnimatedBackground>
          </TabsList>
        </div>
        <TabsContent {...pageTransitionItem('checks-all', 1)} value="all">
          <CheckEventsTable providers={providers} rows={rows} />
        </TabsContent>
        <TabsContent {...pageTransitionItem('checks-attention', 1)} value="attention">
          <CheckEventsTable providers={providers} rows={attentionRows} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
