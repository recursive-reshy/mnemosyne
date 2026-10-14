// Express
import express, { Express } from 'express'
// Errors
import { errorMiddleware, notFoundHandler } from './errors.js'
// Routes
import { healthRoutes } from './routes/health.routes.js'
import { jobsRoutes } from './routes/jobs.routes.js'

export const app: Express = express()

app.use( '/api', express.json() )
app.use( '/api', healthRoutes )
app.use( '/api', jobsRoutes )
app.use( '/api', notFoundHandler )
app.use( errorMiddleware )
