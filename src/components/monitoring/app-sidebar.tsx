import {
  Activity,
  ChevronsUpDown,
  Database,
  Gauge,
  LogOut,
  Settings,
} from 'lucide-react'

import { authClient } from '#/lib/auth-client'
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
} from '#/components/ui/sidebar'

export function AppSidebar({
  user,
}: {
  user: { name: string; email: string }
}) {
  async function signOut() {
    await authClient.signOut()
    window.location.reload()
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" className="hover:bg-white/10">
              <span className="grid size-8 shrink-0 place-items-center rounded-md bg-white text-xs font-bold text-black">
                P
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium text-white">Peek</span>
                <span className="truncate text-xs text-white/45">
                  Infrastructure monitor
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive tooltip="Overview">
                  <Gauge />
                  <span>Overview</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Checks">
                  <Activity />
                  <span>Checks</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Connections">
                  <Database />
                  <span>Connections</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Settings">
                  <Settings />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton size="lg" className="hover:bg-white/10">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/10 text-xs font-medium text-white">
                    {user.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="grid flex-1 text-left leading-tight">
                    <span className="truncate text-sm text-white">
                      {user.name}
                    </span>
                    <span className="truncate text-xs text-white/45">
                      {user.email}
                    </span>
                  </span>
                  <ChevronsUpDown className="ml-auto text-white/45" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
                className="w-56"
              >
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => void signOut()}>
                  <LogOut />
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
