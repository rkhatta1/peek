import { Button } from '#/components/ui/button'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '#/components/ui/empty'
import { Link } from '@tanstack/react-router'
import { useMonitoring } from '../monitoring-context'
import { formatTime } from '../monitoring-data'
import { ChecksTable, ProviderCard } from '../monitoring-panels'
import { pageTransitionItem } from '../page-transition-item'

export function OverviewPage() {
  const { checkedAt, providers, selectedClient, selectedProject } = useMonitoring()

  return (
    <div className="mx-auto w-full max-w-[1480px] p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Overview</h1>
      <div
        {...pageTransitionItem('overview-meta', 0)}
        className="mb-4 flex min-h-5 items-center justify-end"
      >
        <p className="text-xs text-muted-foreground tabular-nums">
          {checkedAt ? `Checked ${formatTime(checkedAt)}` : 'Awaiting collection'}
        </p>
      </div>

      {providers.length ? (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            {providers.map((item, index) => (
              <ProviderCard
                {...pageTransitionItem(`overview-provider-${index}`, index + 1)}
                key={item.connection._id}
                item={item}
              />
            ))}
          </div>
          <section
            {...pageTransitionItem('overview-checks', providers.length + 1)}
            className="mt-4"
            aria-label="Recent checks"
          >
            <ChecksTable providers={providers} />
          </section>
        </>
      ) : (
        <Empty {...pageTransitionItem('overview-empty', 1)} className="border">
          <EmptyHeader>
            <EmptyTitle>
              {!selectedClient
                ? 'Create a client'
                : !selectedProject
                  ? 'Create a project'
                  : 'Connect a service'}
            </EmptyTitle>
            <EmptyDescription>
              {!selectedClient
                ? 'Start with the customer organization in the client selector.'
                : !selectedProject
                  ? 'Add the app you want to monitor in the project selector.'
                  : 'Add Neon Postgres or Upstash Redis to begin collection.'}
            </EmptyDescription>
          </EmptyHeader>
          {selectedProject ? (
            <EmptyContent>
              <Button asChild size="sm">
                <Link to="/connections">Add service</Link>
              </Button>
            </EmptyContent>
          ) : null}
        </Empty>
      )}
    </div>
  )
}
