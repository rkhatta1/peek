import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useConvexAuth } from 'convex/react'
import { useState } from 'react'

import { AccessGate } from '#/components/auth/access-gate'
import { AuthScreen } from '#/components/auth/auth-screen'
import { AppShell } from '#/components/monitoring/app-shell'
import { Skeleton } from '#/components/ui/skeleton'
import { authClient } from '#/lib/auth-client'
import { runViewTransition } from '#/lib/view-transition'

export const Route = createFileRoute('/_app')({ component: AuthenticatedLayout })

function AuthenticatedLayout() {
  const sessionState = authClient.useSession()
  const { data: session, isPending } = sessionState
  const convexAuth = useConvexAuth()
  const router = useRouter()
  const { hasAccess: initialAccess } = Route.useRouteContext()
  const [hasAccess, setHasAccess] = useState(initialAccess)

  async function refreshSession() {
    await runViewTransition(async () => {
      await sessionState.refetch()
      await router.invalidate()
    })
  }

  async function returnToGate() {
    await fetch('/api/access', { method: 'DELETE' })
    await runViewTransition(() => setHasAccess(false))
  }

  async function signOut() {
    await runViewTransition(async () => {
      await authClient.signOut()
      await sessionState.refetch()
      await router.invalidate()
    })
  }

  if (isPending || (session?.user && convexAuth.isLoading)) {
    return <AuthPhase><SessionFallback /></AuthPhase>
  }

  if (!session?.user && !hasAccess) {
    return (
      <AuthPhase>
        <AccessGate
          onSuccess={() => runViewTransition(() => setHasAccess(true))}
        />
      </AuthPhase>
    )
  }
  if (!session?.user) {
    return (
      <AuthPhase>
        <AuthScreen onAuthenticated={refreshSession} onBack={returnToGate} />
      </AuthPhase>
    )
  }
  if (!convexAuth.isAuthenticated) return <AuthPhase><SessionFallback /></AuthPhase>

  return (
    <AuthPhase>
      <AppShell
        onSignOut={signOut}
        user={{
          name: session.user.name || 'Peek user',
          email: session.user.email,
        }}
      />
    </AuthPhase>
  )
}

function AuthPhase({ children }: { children: React.ReactNode }) {
  return <div className="peek-auth-phase min-h-svh">{children}</div>
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
