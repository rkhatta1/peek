import { AlertTriangle } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '#/components/ui/alert'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#/components/ui/empty'
import { useMonitoring } from '../monitoring-context'
import { formatTime } from '../monitoring-data'
import { ChecksTable, ProviderCard } from '../monitoring-panels'
import { pageTransitionItem } from '../page-transition-item'

export function OverviewPage() {
  const { checkedAt, overview, providers } = useMonitoring()
  const hasDemo = providers.some((item) => item.connection.mode === 'demo')

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Overview</h1>
      <div
        {...pageTransitionItem('overview-meta', 0)}
        className="mb-4 flex min-h-5 items-center justify-between gap-4"
      >
        <p className="text-xs text-muted-foreground">
          {providers.length === overview.providers.length
            ? `${providers.length} projects`
            : providers[0]?.connection.name}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {checkedAt ? `Checked ${formatTime(checkedAt)}` : 'Awaiting first collection'}
        </p>
      </div>

      {hasDemo ? (
        <Alert
          {...pageTransitionItem('overview-demo', 1)}
          className="mb-4 border-amber-400/40 bg-amber-500/8"
        >
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Demo data</AlertTitle>
          <AlertDescription>
            Add provider credentials in Convex to begin live collection.
          </AlertDescription>
        </Alert>
      ) : null}

      {providers.length ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {providers.map((item, index) => (
              <ProviderCard
                {...pageTransitionItem(`overview-provider-${index}`, index + 2)}
                key={item.connection._id}
                item={item}
              />
            ))}
          </div>
          <section
            {...pageTransitionItem('overview-checks', providers.length + 2)}
            className="mt-4"
            aria-label="Recent checks"
          >
            <ChecksTable providers={providers} />
          </section>
        </>
      ) : (
        <Empty {...pageTransitionItem('overview-empty', 1)} className="border">
          <EmptyHeader>
            <EmptyTitle>No projects</EmptyTitle>
            <EmptyDescription>This client has no monitoring connections yet.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  )
}
