import { createFileRoute } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'

import { AuthScreen } from '#/components/auth/auth-screen'
import { AppShell } from '#/components/monitoring/app-shell'
import { Skeleton } from '#/components/ui/skeleton'
import { authClient } from '#/lib/auth-client'

export const Route = createFileRoute('/_app')({ component: AuthenticatedLayout })

function AuthenticatedLayout() {
  const { data: session, isPending } = authClient.useSession()
  const convexAuth = useConvexAuth()

  if (isPending || (session?.user && convexAuth.isLoading)) {
    return <SessionFallback />
  }

  if (!session?.user) return <AuthScreen />
  if (!convexAuth.isAuthenticated) return <SessionFallback />

  return (
    <AppShell
      user={{
        name: session.user.name || 'Peek user',
        email: session.user.email,
      }}
    />
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
