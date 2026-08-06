import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'

export type Overview = NonNullable<
  FunctionReturnType<typeof api.monitoring.getOverview>
>
export type ProviderItem = Overview['providers'][number]

type MonitoringContextValue = {
  overview: Overview
  providers: Overview['providers']
  selectedProjectId: string
  setSelectedProjectId: (projectId: string) => void
  refreshing: boolean
  checkedAt: number
  refresh: () => Promise<void>
}

const MonitoringContext = createContext<MonitoringContextValue | null>(null)

export function MonitoringProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const overview = useQuery(
    api.monitoring.getOverview,
    isAuthenticated ? {} : 'skip',
  )
  const ensureWorkspace = useMutation(api.monitoring.ensureWorkspace)
  const refreshNow = useAction(api.collectors.refreshNow)
  const [refreshing, setRefreshing] = useState(false)
  const [requestedProjectId, setRequestedProjectId] = useState('all')
  const [optimisticCheckedAt, setOptimisticCheckedAt] = useState<number | null>(
    null,
  )

  useEffect(() => {
    if (overview === null) void ensureWorkspace()
  }, [ensureWorkspace, overview])

  const selectedProjectId =
    overview?.providers.some(
      (item) => item.connection._id === requestedProjectId,
    )
      ? requestedProjectId
      : 'all'

  const setSelectedProjectId = useCallback((projectId: string) => {
    setRequestedProjectId(projectId)
  }, [])

  const providers = useMemo(
    () =>
      selectedProjectId === 'all'
        ? (overview?.providers ?? [])
        : (overview?.providers.filter(
            (item) => item.connection._id === selectedProjectId,
          ) ?? []),
    [overview, selectedProjectId],
  )

  const checkedAt =
    optimisticCheckedAt ??
    Math.max(
      0,
      ...(overview?.providers.map((item) => item.latest?.capturedAt ?? 0) ?? []),
    )

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setOptimisticCheckedAt(Date.now())
    try {
      await refreshNow()
    } finally {
      setRefreshing(false)
    }
  }, [refreshNow])

  if (overview === undefined || overview === null) {
    return <MonitoringLoading />
  }

  return (
    <MonitoringContext.Provider
      value={{
        overview,
        providers,
        selectedProjectId,
        setSelectedProjectId,
        refreshing,
        checkedAt,
        refresh,
      }}
    >
      {children}
    </MonitoringContext.Provider>
  )
}

export function useMonitoring() {
  const context = useContext(MonitoringContext)
  if (!context) {
    throw new Error('useMonitoring must be used inside MonitoringProvider')
  }
  return context
}

function MonitoringLoading() {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-foreground" />
        Preparing workspace…
      </div>
    </div>
  )
}
