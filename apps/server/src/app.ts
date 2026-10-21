// Express
import express, { Express } from 'express'
// Config
import { config } from './config.js'
// Errors
import { errorMiddleware, notFoundHandler } from './errors.js'
// Middleware
import { requestLog } from './middleware/requestLog.js'
// Routes
import { feedsRoutes } from './routes/feeds.routes.js'
import { gmailRoutes } from './routes/gmail.routes.js'
import { gmailSourcesRoutes } from './routes/gmailSources.routes.js'
import { healthRoutes } from './routes/health.routes.js'
import { inboxRoutes } from './routes/inbox.routes.js'
import { jobsRoutes } from './routes/jobs.routes.js'
import { modelsRoutes } from './routes/models.routes.js'
import { promptProfilesRoutes } from './routes/promptProfiles.routes.js'
import { settingsRoutes } from './routes/settings.routes.js'
import { vaultRoutes } from './routes/vault.routes.js'
import { webRoutes } from './routes/web.routes.js'

export const app: Express = express()

app.use( '/api', requestLog )
app.use( '/api', express.json( { limit: '2mb' } ) )
app.use( '/api', healthRoutes )
app.use( '/api', jobsRoutes )
app.use( '/api', feedsRoutes )
app.use( '/api', inboxRoutes )
app.use( '/api', gmailRoutes )
app.use( '/api', gmailSourcesRoutes )
app.use( '/api', vaultRoutes )
app.use( '/api', settingsRoutes )
app.use( '/api', modelsRoutes )
app.use( '/api', promptProfilesRoutes )
app.use( '/api', notFoundHandler )

if( config.webDir !== undefined ) {
  app.use( webRoutes( config.webDir ) )
}

app.use( errorMiddleware )
