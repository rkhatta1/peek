import { Link, useLocation } from '@tanstack/react-router'
import {
  Activity,
  Bot,
  ChevronsUpDown,
  Database,
  Gauge,
  LogOut,
  PanelLeft,
  Settings,
} from 'lucide-react'

import { authClient } from '#/lib/auth-client'
import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '#/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '#/components/ui/tooltip'
import { PeekMark } from './peek-mark'

const navigation = [
  { label: 'Overview', href: '/', icon: Gauge },
  { label: 'Checks', href: '/checks', icon: Activity },
  { label: 'Agent', href: '/agent', icon: Bot },
  { label: 'Connections', href: '/connections', icon: Database },
  { label: 'Settings', href: '/settings', icon: Settings },
] as const

export function AppSidebar({
  user,
}: {
  user: { name: string; email: string }
}) {
  const location = useLocation()
  const { isMobile, setOpenMobile, state, toggleSidebar } = useSidebar()

  async function signOut() {
    await authClient.signOut()
    window.location.reload()
  }

  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center justify-between">
            {isMobile ? (
              <>
                <PeekMark />
                <Tooltip>
                  <TooltipTrigger asChild>
                    <SidebarTrigger className="size-8" />
                  </TooltipTrigger>
                  <TooltipContent>Close sidebar</TooltipContent>
                </Tooltip>
              </>
            ) : (
              <Button
                aria-expanded={state === 'expanded'}
                aria-label="Toggle sidebar"
                className="group/toggle relative size-8"
                onClick={toggleSidebar}
                size="icon"
                variant="ghost"
              >
                <PeekMark className="transition-opacity duration-150 motion-reduce:transition-none group-hover/toggle:opacity-0" />
                <PanelLeft className="absolute size-4 opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-hover/toggle:opacity-100" />
              </Button>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigation.map((item) => {
                const active =
                  item.href === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(item.href)
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.label}>
                      <Link
                        activeOptions={{ exact: item.href === '/' }}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false)
                        }}
                        preload="intent"
                        to={item.href}
                      >
                        <item.icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                  className="data-[state=open]:bg-sidebar-accent"
                  size="lg"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-sidebar-border bg-sidebar-accent text-xs font-medium">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="grid min-w-0 flex-1 text-left leading-tight">
                    <span className="truncate text-sm font-medium">{user.name}</span>
                    <span className="truncate text-xs text-sidebar-foreground/55">
                      {user.email}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto text-sidebar-foreground/55" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="w-64"
                side={isMobile ? 'bottom' : 'right'}
                sideOffset={8}
              >
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut aria-hidden="true" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
