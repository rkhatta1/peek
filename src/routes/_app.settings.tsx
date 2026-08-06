import { createFileRoute } from '@tanstack/react-router'

import { SettingsPage } from '#/components/monitoring/pages/settings-page'

export const Route = createFileRoute('/_app/settings')({ component: SettingsRoute })

function SettingsRoute() {
  return <SettingsPage />
}
