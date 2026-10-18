// Express
import { Router } from 'express'
// Controllers
import {
  createJob,
  discardReviewedJob,
  downloadTranscript,
  getJob,
  getSource,
  listActiveJobs,
  regenerateJobSummary,
  retryJobSummary,
  saveReviewedJob,
  submitJobText,
  updateJobDraft,
} from '../controllers/jobs.controller.js'

export const jobsRoutes: Router = Router()

jobsRoutes.post( '/jobs', createJob )
jobsRoutes.get( '/jobs', listActiveJobs )
jobsRoutes.get( '/jobs/:id', getJob )
jobsRoutes.get( '/jobs/:id/source', getSource )
jobsRoutes.post( '/jobs/:id/text', submitJobText )
jobsRoutes.patch( '/jobs/:id/draft', updateJobDraft )
jobsRoutes.post( '/jobs/:id/save', saveReviewedJob )
jobsRoutes.post( '/jobs/:id/retry-summary', retryJobSummary )
jobsRoutes.post( '/jobs/:id/regenerate-summary', regenerateJobSummary )
jobsRoutes.delete( '/jobs/:id', discardReviewedJob )
jobsRoutes.get( '/jobs/:id/download', downloadTranscript )
