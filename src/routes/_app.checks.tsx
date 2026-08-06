import { createFileRoute } from '@tanstack/react-router'

import { ChecksPage } from '#/components/monitoring/pages/checks-page'

export const Route = createFileRoute('/_app/checks')({ component: ChecksRoute })

function ChecksRoute() {
  return <ChecksPage />
}
