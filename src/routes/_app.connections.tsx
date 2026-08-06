import { createFileRoute } from '@tanstack/react-router'

import { ConnectionsPage } from '#/components/monitoring/pages/connections-page'

export const Route = createFileRoute('/_app/connections')({
  component: ConnectionsRoute,
})

function ConnectionsRoute() {
  return <ConnectionsPage />
}
