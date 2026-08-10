import { convexBetterAuthReactStart } from '@convex-dev/better-auth/react-start'

import { proxyAuthRequest } from './auth-proxy'

const convexUrl = process.env.VITE_CONVEX_URL!
const convexSiteUrl = process.env.VITE_CONVEX_SITE_URL!

const auth = convexBetterAuthReactStart({
  convexUrl,
  convexSiteUrl,
})

export const getToken = auth.getToken

export function handler(request: Request, headers?: HeadersInit) {
  return proxyAuthRequest(request, convexSiteUrl, headers)
}
