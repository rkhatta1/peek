import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'

import { api } from '../../../convex/_generated/api'
import type { Id } from '../../../convex/_generated/dataModel'
import {
  collectionFreshnessLimitMs,
  evaluateSnapshot,
} from '../../../convex/lib/monitoring'

export type Client = FunctionReturnType<typeof api.clients.list>[number]
export type Project = FunctionReturnType<
  typeof api.projects.listByClient
>[number]
export type MonitoringSummary = NonNullable<
  FunctionReturnType<typeof api.monitoring.getSummary>
>
export type ServiceHistory = FunctionReturnType<
  typeof api.monitoring.getHistory
>[number]
export type CodeConnection = FunctionReturnType<
  typeof api.codeConnections.listByProject
>[number]
export type CodeAttribution = FunctionReturnType<
  typeof api.codeConnectionActions.resolveAttribution
>
type SummaryProvider = MonitoringSummary['providers'][number]
export type ProviderItem = SummaryProvider & {
  history: ServiceHistory['history']
  evaluation: ReturnType<typeof evaluateSnapshot> | null
}

export type ServiceCredentials =
  | { provider: 'neon'; databaseUrl: string }
  | {
      provider: 'upstash'
      email: string
      apiKey: string
      databaseId: string
    }

export type CodeConnectionConfiguration =
  | { provider: 'github'; repository: string; token: string }
  | { provider: 'vercel'; projectId: string; token: string }

type MonitoringContextValue = {
  clients: Client[]
  projects: Project[]
  overview: MonitoringSummary | null
  providers: ProviderItem[]
  codeConnections: CodeConnection[]
  selectedClient: Client | null
  selectedClientId: Id<'clients'> | null
  setSelectedClientId: (clientId: Id<'clients'>) => void
  selectedProject: Project | null
  selectedProjectId: Id<'projects'> | null
  setSelectedProjectId: (projectId: Id<'projects'>) => void
  createClient: (name: string) => Promise<Id<'clients'>>
  updateClient: (clientId: Id<'clients'>, name: string) => Promise<void>
  removeClient: (clientId: Id<'clients'>) => Promise<void>
  createProject: (
    clientId: Id<'clients'>,
    name: string,
  ) => Promise<Id<'projects'>>
  updateProject: (projectId: Id<'projects'>, name: string) => Promise<void>
  removeProject: (projectId: Id<'projects'>) => Promise<void>
  connectService: (args: {
    projectId: Id<'projects'>
    serviceId?: Id<'serviceConnections'>
    name: string
    environment: string
    credentials: ServiceCredentials
  }) => Promise<Id<'serviceConnections'>>
  updateService: (args: {
    serviceId: Id<'serviceConnections'>
    name: string
    environment: string
    active: boolean
  }) => Promise<void>
  removeService: (serviceId: Id<'serviceConnections'>) => Promise<void>
  connectCodeConnection: (args: {
    projectId: Id<'projects'>
    configuration: CodeConnectionConfiguration
  }) => Promise<Id<'codeConnections'>>
  removeCodeConnection: (connectionId: Id<'codeConnections'>) => Promise<void>
  resolveCodeAttribution: (args: {
    projectId: Id<'projects'>
    observedAt: number
  }) => Promise<CodeAttribution>
  refreshing: boolean
  checkedAt: number
  refresh: () => Promise<void>
}

const MonitoringContext = createContext<MonitoringContextValue | null>(null)

export function MonitoringProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const clients = useQuery(api.clients.list, isAuthenticated ? {} : 'skip')
  const [requestedClientId, setRequestedClientId] =
    useState<Id<'clients'> | null>(null)
  const selectedClient =
    clients?.find((client) => client._id === requestedClientId) ??
    clients?.[0] ??
    null
  const projects = useQuery(
    api.projects.listByClient,
    isAuthenticated && selectedClient
      ? { clientId: selectedClient._id }
      : 'skip',
  )
  const [requestedProjectId, setRequestedProjectId] =
    useState<Id<'projects'> | null>(null)
  const selectedProject =
    projects?.find((project) => project._id === requestedProjectId) ??
    projects?.[0] ??
    null
  const rawSummary = useQuery(
    api.monitoring.getSummary,
    isAuthenticated && selectedProject
      ? { projectId: selectedProject._id }
      : 'skip',
  )
  const codeConnections = useQuery(
    api.codeConnections.listByProject,
    isAuthenticated && selectedProject
      ? { projectId: selectedProject._id }
      : 'skip',
  )

  const createClientMutation = useMutation(api.clients.create)
  const updateClientMutation = useMutation(api.clients.update).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.clients.list, {})
      if (!current) return
      store.setQuery(
        api.clients.list,
        {},
        current.map((client) =>
          client._id === args.clientId
            ? { ...client, name: args.name, updatedAt: Date.now() }
            : client,
        ),
      )
    },
  )
  const removeClientMutation = useMutation(api.clients.remove).withOptimisticUpdate(
    (store, args) => {
      const current = store.getQuery(api.clients.list, {})
      if (!current) return
      store.setQuery(
        api.clients.list,
        {},
        current.filter((client) => client._id !== args.clientId),
      )
    },
  )
  const createProjectMutation = useMutation(api.projects.create)
  const updateProjectMutation = useMutation(
    api.projects.update,
  ).withOptimisticUpdate((store, args) => {
    if (!selectedClient) return
    const queryArgs = { clientId: selectedClient._id }
    const current = store.getQuery(api.projects.listByClient, queryArgs)
    if (!current) return
    store.setQuery(
      api.projects.listByClient,
      queryArgs,
      current.map((project) =>
        project._id === args.projectId
          ? { ...project, name: args.name, updatedAt: Date.now() }
          : project,
      ),
    )
  })
  const removeProjectMutation = useMutation(
    api.projects.remove,
  ).withOptimisticUpdate((store, args) => {
    if (!selectedClient) return
    const queryArgs = { clientId: selectedClient._id }
    const current = store.getQuery(api.projects.listByClient, queryArgs)
    if (!current) return
    store.setQuery(
      api.projects.listByClient,
      queryArgs,
      current.filter((project) => project._id !== args.projectId),
    )
  })
  const connectServiceAction = useAction(api.serviceActions.connect)
  const updateServiceMutation = useMutation(
    api.services.update,
  ).withOptimisticUpdate((store, args) => {
    if (!selectedProject) return
    const queryArgs = { projectId: selectedProject._id }
    const current = store.getQuery(api.monitoring.getSummary, queryArgs)
    if (!current) return
    store.setQuery(api.monitoring.getSummary, queryArgs, {
      ...current,
      providers: current.providers.map((item) =>
        item.connection._id === args.serviceId
          ? {
              ...item,
              connection: {
                ...item.connection,
                name: args.name,
                environment: args.environment,
                active: args.active,
                updatedAt: Date.now(),
              },
            }
          : item,
      ),
    })
  })
  const removeServiceMutation = useMutation(
    api.services.remove,
  ).withOptimisticUpdate((store, args) => {
    if (!selectedProject) return
    const queryArgs = { projectId: selectedProject._id }
    const current = store.getQuery(api.monitoring.getSummary, queryArgs)
    if (!current) return
    store.setQuery(api.monitoring.getSummary, queryArgs, {
      ...current,
      providers: current.providers.filter(
        (item) => item.connection._id !== args.serviceId,
      ),
    })
  })
  const connectCodeConnectionAction = useAction(api.codeConnectionActions.connect)
  const removeCodeConnectionMutation = useMutation(
    api.codeConnections.remove,
  ).withOptimisticUpdate((store, args) => {
    if (!selectedProject) return
    const queryArgs = { projectId: selectedProject._id }
    const current = store.getQuery(api.codeConnections.listByProject, queryArgs)
    if (!current) return
    store.setQuery(
      api.codeConnections.listByProject,
      queryArgs,
      current.filter((connection) => connection._id !== args.connectionId),
    )
  })
  const resolveCodeAttributionAction = useAction(
    api.codeConnectionActions.resolveAttribution,
  )
  const refreshNow = useAction(api.collectors.refreshNow)
  const [projectRefreshState, setProjectRefreshState] = useState<
    Partial<
      Record<
        Id<'projects'>,
        { checkedAt: number | null; refreshing: boolean }
      >
    >
  >({})

  const setSelectedClientId = useCallback((clientId: Id<'clients'>) => {
    setRequestedClientId(clientId)
    setRequestedProjectId(null)
  }, [])

  const providers = useMemo(
    () =>
      (rawSummary?.providers ?? []).map((item) => ({
        ...item,
        history: [],
        evaluation: item.latest
          ? evaluateSnapshot(toEvaluatableSnapshot(item.latest), {
              now: Date.now(),
              staleAfterMs: collectionFreshnessLimitMs(
                rawSummary?.project.collectionIntervalMinutes ?? 15,
              ),
            })
          : null,
      })),
    [rawSummary],
  )

  const selectedProjectRefreshState = selectedProject
    ? projectRefreshState[selectedProject._id]
    : undefined
  const checkedAt =
    selectedProjectRefreshState?.checkedAt ??
    Math.max(0, ...providers.map((item) => item.latest?.capturedAt ?? 0))
  const refreshing = selectedProjectRefreshState?.refreshing ?? false

  const createClient = useCallback(
    async (name: string) => {
      const clientId = await createClientMutation({ name })
      setRequestedClientId(clientId)
      setRequestedProjectId(null)
      return clientId
    },
    [createClientMutation],
  )

  const createProject = useCallback(
    async (clientId: Id<'clients'>, name: string) => {
      const projectId = await createProjectMutation({ clientId, name })
      setRequestedClientId(clientId)
      setRequestedProjectId(projectId)
      return projectId
    },
    [createProjectMutation],
  )

  const refresh = useCallback(async () => {
    if (!selectedProject) return
    const projectId = selectedProject._id
    setProjectRefreshState((current) => ({
      ...current,
      [projectId]: {
        checkedAt: current[projectId]?.checkedAt ?? null,
        refreshing: true,
      },
    }))
    try {
      await refreshNow({ projectId })
      setProjectRefreshState((current) => ({
        ...current,
        [projectId]: { checkedAt: Date.now(), refreshing: false },
      }))
    } finally {
      setProjectRefreshState((current) => {
        const projectState = current[projectId]
        if (!projectState?.refreshing) return current
        return {
          ...current,
          [projectId]: { ...projectState, refreshing: false },
        }
      })
    }
  }, [refreshNow, selectedProject])

  if (clients === undefined) return <MonitoringLoading />

  return (
    <MonitoringContext.Provider
      value={{
        clients,
        projects: projects ?? [],
        overview: rawSummary ?? null,
        providers,
        codeConnections: codeConnections ?? [],
        selectedClient,
        selectedClientId: selectedClient?._id ?? null,
        setSelectedClientId,
        selectedProject,
        selectedProjectId: selectedProject?._id ?? null,
        setSelectedProjectId: setRequestedProjectId,
        createClient,
        updateClient: async (clientId, name) => {
          await updateClientMutation({ clientId, name })
        },
        removeClient: async (clientId) => {
          await removeClientMutation({ clientId })
          setRequestedClientId(null)
          setRequestedProjectId(null)
        },
        createProject,
        updateProject: async (projectId, name) => {
          await updateProjectMutation({ projectId, name })
        },
        removeProject: async (projectId) => {
          await removeProjectMutation({ projectId })
          setRequestedProjectId(null)
        },
        connectService: connectServiceAction,
        updateService: async (args) => {
          await updateServiceMutation(args)
        },
        removeService: async (serviceId) => {
          await removeServiceMutation({ serviceId })
        },
        connectCodeConnection: connectCodeConnectionAction,
        removeCodeConnection: async (connectionId) => {
          await removeCodeConnectionMutation({ connectionId })
        },
        resolveCodeAttribution: resolveCodeAttributionAction,
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

function toEvaluatableSnapshot(snapshot: SummaryProvider['latest'] & {}) {
  if (snapshot.provider === 'neon') {
    return {
      provider: 'neon' as const,
      capturedAt: snapshot.capturedAt,
      status: snapshot.status,
      connections: snapshot.connections,
      cacheHitRatio: snapshot.cacheHitRatio,
      deadlocks: snapshot.deadlocks ?? 0,
      logicalSizeBytes: snapshot.logicalSizeBytes ?? 0,
      queryInsightsEnabled: snapshot.queryInsightsEnabled ?? false,
    }
  }
  return {
    provider: 'upstash' as const,
    capturedAt: snapshot.capturedAt,
    status: snapshot.status,
    connections: snapshot.connections,
    cacheHitRatio: snapshot.cacheHitRatio,
    requestCount: snapshot.requestCount ?? 0,
    storageBytes: snapshot.storageBytes ?? 0,
    p99LatencyMs: snapshot.p99LatencyMs ?? 0,
  }
}

function MonitoringLoading() {
  return (
    <div className="grid min-h-svh place-items-center bg-background">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className="size-2 animate-pulse rounded-full bg-foreground" />
        Loading…
      </div>
    </div>
  )
}
