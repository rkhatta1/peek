import { ExternalLink } from 'lucide-react'

import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '#/components/ui/card'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Separator } from '#/components/ui/separator'
import { Switch } from '#/components/ui/switch'
import { useTheme } from '#/hooks/use-theme'
import { useMonitoring } from '../monitoring-context'
import { pageTransitionItem } from '../page-transition-item'

export function SettingsPage() {
  const { overview } = useMonitoring()
  const { theme, setTheme } = useTheme()

  return (
    <div className="mx-auto w-full max-w-4xl p-4 md:p-6 lg:p-8">
      <h1 className="sr-only">Settings</h1>
      <div className="grid gap-4">
        <Card {...pageTransitionItem('settings-client', 0)} className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Client</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2">
              <Label htmlFor="client-name">Name</Label>
              <Input id="client-name" readOnly value={overview.workspace.name} />
              <p className="text-xs text-muted-foreground">
                Managed by the authenticated Convex workspace.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card {...pageTransitionItem('settings-preferences', 1)} className="shadow-none">
          <CardHeader>
            <CardTitle className="text-sm">Preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="dark-mode">Dark mode</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Saved on this device.
                </p>
              </div>
              <Switch
                checked={theme === 'dark'}
                id="dark-mode"
                onCheckedChange={(checked) => setTheme(checked ? 'dark' : 'light')}
              />
            </div>
            <Separator />
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Collection interval</p>
                <p className="mt-1 text-xs text-muted-foreground">Every 15 minutes</p>
              </div>
              <Button asChild size="sm" variant="outline">
                <a href="https://dashboard.convex.dev" target="_blank" rel="noreferrer">
                  Configure
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
