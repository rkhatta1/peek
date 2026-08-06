import { createFileRoute } from '@tanstack/react-router'

import { OverviewPage } from '#/components/monitoring/pages/overview-page'

export const Route = createFileRoute('/_app/')({ component: OverviewRoute })

function OverviewRoute() {
  return <OverviewPage />
}
