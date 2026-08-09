import { httpRouter } from 'convex/server'

import { authComponent, createAuth } from './auth'
import { events, status } from './agentApiHttp'

const http = httpRouter()
authComponent.registerRoutes(http, createAuth)
http.route({ path: '/status', method: 'GET', handler: status })
http.route({ path: '/events', method: 'POST', handler: events })

export default http
