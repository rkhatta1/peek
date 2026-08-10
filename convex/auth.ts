/// <reference types="node" />

import { createClient } from '@convex-dev/better-auth'
import type { GenericCtx } from '@convex-dev/better-auth'
import { convex } from '@convex-dev/better-auth/plugins'
import { betterAuth } from 'better-auth/minimal'
import { APIError, createAuthMiddleware } from 'better-auth/api'

import { components } from './_generated/api'
import type { DataModel } from './_generated/dataModel'
import authConfig from './auth.config'
import {
  ACCESS_GRANT_HEADER,
  verifyAccessToken,
} from './lib/accessGateCrypto'

const siteUrl = process.env.SITE_URL ?? 'http://localhost:3004'

export const authComponent = createClient<DataModel>(components.betterAuth)

export function createAuth(ctx: GenericCtx<DataModel>) {
  return betterAuth({
    appName: 'Peek',
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    trustedOrigins: [siteUrl],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
    },
    hooks: {
      before: createAuthMiddleware(async (hookCtx) => {
        if (!requiresAccessGrant(hookCtx.path)) return
        const token = hookCtx.headers?.get(ACCESS_GRANT_HEADER)
        if (
          !token ||
          token.length > 200 ||
          !(await verifyAccessToken(token, hookCtx.context.secret))
        ) {
          throw new APIError('FORBIDDEN', {
            message: 'Access grant required',
          })
        }
      }),
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
        strategy: 'compact',
      },
    },
    rateLimit: {
      enabled: process.env.NODE_ENV === 'production',
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 3 },
      },
    },
    plugins: [convex({ authConfig })],
  })
}

function requiresAccessGrant(path: string) {
  return path === '/sign-in/email' || path === '/sign-up/email'
}

export const { getAuthUser } = authComponent.clientApi()
