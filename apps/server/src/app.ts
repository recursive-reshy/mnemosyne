// Express
import express, { Express } from 'express'
// Config
import { config } from './config.js'
// Errors
import { errorMiddleware, notFoundHandler } from './errors.js'
// Routes
import { healthRoutes } from './routes/health.routes.js'
import { jobsRoutes } from './routes/jobs.routes.js'
import { webRoutes } from './routes/web.routes.js'

export const app: Express = express()

app.use( '/api', express.json() )
app.use( '/api', healthRoutes )
app.use( '/api', jobsRoutes )
app.use( '/api', notFoundHandler )

if( config.webDir !== undefined ) {
  app.use( webRoutes( config.webDir ) )
}

app.use( errorMiddleware )
