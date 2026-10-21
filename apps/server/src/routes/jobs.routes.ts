// Express
import { Router } from 'express'
// Controllers
import {
  acceptLinkSuggestions,
  createJob,
  discardReviewedJob,
  downloadTranscript,
  getJob,
  getLinkSuggestions,
  getSource,
  listActiveJobs,
  regenerateJobSummary,
  rejectLinkSuggestions,
  retryJobSummary,
  runJobLinking,
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
jobsRoutes.get( '/jobs/:id/link-suggestions', getLinkSuggestions )
jobsRoutes.post( '/jobs/:id/link-suggestions/accept', acceptLinkSuggestions )
jobsRoutes.post( '/jobs/:id/link-suggestions/reject', rejectLinkSuggestions )
jobsRoutes.post( '/jobs/:id/linking', runJobLinking )
jobsRoutes.delete( '/jobs/:id', discardReviewedJob )
jobsRoutes.get( '/jobs/:id/download', downloadTranscript )
