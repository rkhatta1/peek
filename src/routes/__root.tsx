/// <reference types="vite/client" />

import {
  HeadContent,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import type { ConvexQueryClient } from '@convex-dev/react-query'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'

import ConvexProvider from '../integrations/convex/provider'
import { getToken } from '../lib/auth-server'
import { hasAccessGate } from '../lib/access-gate-server'
import { Button } from '../components/ui/button'

import appCss from '../styles.css?url'

const getAuth = createServerFn({ method: 'GET' }).handler(async () => {
  const token = await getToken()
  return {
    token,
    hasAccess: Boolean(token) || (await hasAccessGate(getRequest())),
  }
})

export const Route = createRootRouteWithContext<{
  convexQueryClient: ConvexQueryClient
}>()({
  beforeLoad: async ({ context }) => {
    const { token, hasAccess } = await getAuth()
    if (token) {
      context.convexQueryClient.serverHttpClient?.setAuth(token)
    }
    return { token, hasAccess, isAuthenticated: Boolean(token) }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content:
          'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      {
        title: 'Peek · Infrastructure monitoring',
      },
      {
        name: 'description',
        content: 'External Neon and Upstash monitoring for client systems.',
      },
      {
        name: 'theme-color',
        content: '#ffffff',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  notFoundComponent: NotFoundPage,
  shellComponent: RootDocument,
})

function NotFoundPage() {
  return (
    <main id="main-content" className="grid min-h-svh place-items-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
          Page not found
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you requested does not exist in Peek.
        </p>
        <Button asChild className="mt-5">
          <a href="/">Return to overview</a>
        </Button>
      </div>
    </main>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const { token } = Route.useRouteContext()

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('peek-theme');const d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light';const m=document.querySelector('meta[name=theme-color]');if(m)m.content=d?'#171717':'#ffffff'}catch{}",
          }}
        />
      </head>
      <body>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <ConvexProvider initialToken={token}>
          {children}
          {import.meta.env.DEV ? (
            <TanStackDevtools
              config={{ position: 'bottom-right' }}
              plugins={[
                {
                  name: 'TanStack Router',
                  render: <TanStackRouterDevtoolsPanel />,
                },
              ]}
            />
          ) : null}
        </ConvexProvider>
        <Scripts />
      </body>
    </html>
  )
}
