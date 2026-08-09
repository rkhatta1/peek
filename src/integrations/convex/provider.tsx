import { ConvexQueryClient } from '@convex-dev/react-query'
import {
  ConvexBetterAuthProvider,
  type AuthClient,
} from '@convex-dev/better-auth/react'

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
      // Upstream #420: Better Auth 1.6.22+ changed this public return type.
      authClient={authClient as unknown as AuthClient}
      initialToken={initialToken}
    >
      {children}
    </ConvexBetterAuthProvider>
  )
}
