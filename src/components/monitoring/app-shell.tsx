import { Outlet, useLocation, useRouterState } from '@tanstack/react-router'
import { Moon, RefreshCw, Sun } from 'lucide-react'

import { Button } from '#/components/ui/button'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '#/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { useTheme } from '#/hooks/use-theme'
import { AppSidebar } from './app-sidebar'
import { ClientSwitcher } from './client-switcher'
import { MonitoringProvider, useMonitoring } from './monitoring-context'
import { PeekMark } from './peek-mark'
import { ProjectSwitcher } from './project-switcher'

const routeLabels: Record<string, string> = {
  '/': 'Overview',
  '/checks': 'Checks',
  '/connections': 'Connections',
  '/settings': 'Settings',
}

export function AppShell({
  user,
}: {
  user: { name: string; email: string }
}) {
  return (
    <MonitoringProvider>
      <SidebarProvider className="h-svh min-h-0 overflow-hidden">
        <AppSidebar user={user} />
        <AppFrame />
      </SidebarProvider>
    </MonitoringProvider>
  )
}

function AppFrame() {
  const location = useLocation()
  const { refreshing, refresh, selectedProject } = useMonitoring()
  const { theme, toggleTheme } = useTheme()
  const label = routeLabels[location.pathname] ?? 'Peek'

  return (
    <SidebarInset id="main-content" className="min-h-0 overflow-hidden">
      <Tooltip>
        <TooltipTrigger asChild>
          <SidebarTrigger className="fixed left-3 top-3 z-40 size-10 border bg-background/90 shadow-sm backdrop-blur md:hidden" />
        </TooltipTrigger>
        <TooltipContent>Open sidebar</TooltipContent>
      </Tooltip>
      <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:px-5">
        <div className="flex min-w-0 items-center gap-0.5">
          <ClientSwitcher />
          <span aria-hidden="true" className="text-xs text-muted-foreground/50">
            /
          </span>
          <ProjectSwitcher />
        </div>
        <p className="pointer-events-none absolute left-1/2 hidden -translate-x-1/2 text-xs font-medium xl:block">
          {label}
        </p>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                onClick={toggleTheme}
                size="icon"
                variant="ghost"
              >
                {theme === 'dark' ? (
                  <Sun aria-hidden="true" />
                ) : (
                  <Moon aria-hidden="true" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label="Refresh monitoring data"
                disabled={refreshing || !selectedProject}
                onClick={() => void refresh()}
                size="icon"
                variant="ghost"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={refreshing ? 'animate-spin' : ''}
                />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{refreshing ? 'Refreshing…' : 'Refresh'}</TooltipContent>
          </Tooltip>
        </div>
      </header>
      <PageTransition />
    </SidebarInset>
  )
}

function PageTransition() {
  const isLoading = useRouterState({ select: (state) => state.isLoading })

  return (
    <div
      className="relative isolate min-h-0 flex-1 overflow-hidden"
      data-page-transition={isLoading ? 'loading' : 'idle'}
    >
      <div
        aria-hidden={!isLoading}
        className="pointer-events-none absolute inset-0 z-0 grid place-items-center bg-background"
      >
        <PeekMark className="size-12 text-sm" />
      </div>
      <div
        aria-busy={isLoading || undefined}
        className="peek-page relative z-10 h-full overflow-y-auto overscroll-contain bg-background"
      >
        <Outlet />
      </div>
    </div>
  )
}
