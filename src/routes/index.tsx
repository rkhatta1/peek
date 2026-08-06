import { lazy, Suspense } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

import { AuthScreen } from '#/components/auth/auth-screen'
import { Skeleton } from '#/components/ui/skeleton'
import { authClient } from '#/lib/auth-client'

const MonitoringDashboard = lazy(() =>
  import('#/components/monitoring/monitoring-dashboard').then((module) => ({
    default: module.MonitoringDashboard,
  })),
)

export const Route = createFileRoute('/')({ component: Home })

function Home() {
  const { data: session, isPending } = authClient.useSession()
  const convexAuth = useConvexAuth()

  if (isPending || (session?.user && convexAuth.isLoading)) {
    return <SessionFallback />
  }

  if (!session?.user) return <AuthScreen />
  if (!convexAuth.isAuthenticated) return <SessionFallback />

  return (
    <Suspense fallback={<DashboardFallback />}>
      <MonitoringDashboard
        user={{
          name: session.user.name || 'Peek user',
          email: session.user.email,
        }}
      />
    </Suspense>
  )
}

function SessionFallback() {
  return (
    <main id="main-content" className="grid min-h-svh place-items-center bg-background">
      <div className="w-full max-w-xs space-y-3" aria-label="Loading session">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </main>
  )
}

function DashboardFallback() {
  return (
    <main id="main-content" className="grid min-h-svh place-items-center bg-background">
      <div className="w-full max-w-3xl space-y-4 px-6" aria-label="Loading dashboard">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    </main>
  )
}
