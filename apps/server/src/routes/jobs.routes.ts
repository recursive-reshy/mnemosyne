// Express
import { Router } from 'express'
// Controllers
import {
  createJob,
  downloadTranscript,
  getJob,
  getTranscript,
  listActiveJobs,
  retryJobSummary,
  saveReviewedJob,
} from '../controllers/jobs.controller.js'

export const jobsRoutes: Router = Router()

jobsRoutes.post( '/jobs', createJob )
jobsRoutes.get( '/jobs', listActiveJobs )
jobsRoutes.get( '/jobs/:id', getJob )
jobsRoutes.get( '/jobs/:id/transcript', getTranscript )
jobsRoutes.post( '/jobs/:id/save', saveReviewedJob )
jobsRoutes.post( '/jobs/:id/retry-summary', retryJobSummary )
jobsRoutes.get( '/jobs/:id/download', downloadTranscript )
