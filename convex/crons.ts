import { cronJobs } from 'convex/server'

import { internal } from './_generated/api'

const crons = cronJobs()

crons.interval(
  'collect Neon and Upstash metrics',
  { minutes: 15 },
  internal.collectors.collectScheduled,
  {},
)

export default crons
