// Express
import express, { Express } from 'express'
// Routes
import { healthRoutes } from './routes/health.routes.js'

export const app: Express = express()

app.use( '/api', healthRoutes )
