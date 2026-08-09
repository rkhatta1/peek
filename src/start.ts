import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

import { withSecurityHeaders } from './lib/security-headers'

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next()
  if (result.response instanceof Response) {
    result.response = withSecurityHeaders(
      result.response,
      process.env.NODE_ENV === 'production',
    )
  }
  return result
})

const csrf = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === 'serverFn',
})

export const startInstance = createStart(() => ({
  requestMiddleware: [securityHeaders, csrf],
}))
