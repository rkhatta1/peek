import { describe, expect, test } from 'vitest'

import { foldScheduledPage } from './checkTriggers'

describe('scheduled Check aggregation', () => {
  test('carries a split Project across service pages and completes it once', () => {
    const first = foldScheduledPage(
      null,
      [aggregate('project-a', 20, 18, 1, 1)],
      false,
    )
    expect(first.completed).toEqual([])

    const second = foldScheduledPage(
      first.pending,
      [aggregate('project-a', 6, 5, 1, 0), aggregate('project-b', 3, 3, 0, 0)],
      true,
    )
    expect(second.pending).toBeNull()
    expect(second.completed).toEqual([
      aggregate('project-a', 26, 23, 2, 1),
      aggregate('project-b', 3, 3, 0, 0),
    ])
  })
})

function aggregate(
  projectId: string,
  serviceCount: number,
  operationalCount: number,
  attentionCount: number,
  unavailableCount: number,
) {
  return {
    projectId,
    ownerId: `owner-${projectId}`,
    triggeredAt: 100,
    completedAt: 200,
    serviceCount,
    operationalCount,
    attentionCount,
    unavailableCount,
  }
}
