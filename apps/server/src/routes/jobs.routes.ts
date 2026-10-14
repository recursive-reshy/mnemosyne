// Express
import { Router } from 'express'
// Controllers
import {
  createJob,
  downloadTranscript,
  getJob,
} from '../controllers/jobs.controller.js'

export const jobsRoutes: Router = Router()

jobsRoutes.post( '/jobs', createJob )
jobsRoutes.get( '/jobs/:id', getJob )
jobsRoutes.get( '/jobs/:id/download', downloadTranscript )
