import { ConvexQueryClient } from '@convex-dev/react-query'
import { ConvexBetterAuthProvider } from '@convex-dev/better-auth/react'

import { authClient } from '../../lib/auth-client'

const CONVEX_URL = (import.meta as any).env.VITE_CONVEX_URL
if (!CONVEX_URL) {
  console.error('missing envar CONVEX_URL')
}
export const convexQueryClient = new ConvexQueryClient(CONVEX_URL, {
  expectAuth: true,
})

export default function AppConvexProvider({
  children,
  initialToken,
}: {
  children: React.ReactNode
  initialToken?: string | null
}) {
  return (
    <ConvexBetterAuthProvider
      client={convexQueryClient.convexClient}
      authClient={authClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  )
}
