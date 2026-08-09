import { createFileRoute } from '@tanstack/react-router'

import { AgentPage } from '#/components/monitoring/pages/agent-page'

export const Route = createFileRoute('/_app/agent')({
  component: AgentRoute,
})

function AgentRoute() {
  return <AgentPage />
}
