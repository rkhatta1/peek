import betterAuth from '@convex-dev/better-auth/convex.config'
import { defineApp } from 'convex/server'
import { v } from 'convex/values'

const app = defineApp({
  env: {
    PEEK_CREDENTIAL_ENCRYPTION_KEY: v.string(),
    PEEK_CREDENTIAL_PREVIOUS_ENCRYPTION_KEY: v.optional(v.string()),
  },
})
app.use(betterAuth)

export default app
