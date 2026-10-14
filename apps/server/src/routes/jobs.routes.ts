// Express
import { Router } from 'express'
// Controllers
import { createJob, getJob } from '../controllers/jobs.controller.js'

export const jobsRoutes: Router = Router()

jobsRoutes.post( '/jobs', createJob )
jobsRoutes.get( '/jobs/:id', getJob )
