// Express
import { Request, Response } from 'express'
// Shared
import {
  CreateJobBody,
  CreateJobResponse,
  GetJobResponse,
} from '@mnemosyne/shared'
// Services
import { findJob, queueJob } from '../services/jobs.service.js'

export function createJob( { body }: Request, res: Response< CreateJobResponse > ): void {
  const { url } = CreateJobBody.parse( body )

  const job = queueJob( url )

  res
    .status( 202 )
    .location( `/api/jobs/${ job.id }` )
    .json( { job_id: job.id } )
}

export function getJob( { params }: Request, res: Response< GetJobResponse > ): void {
  const job = findJob( String( params.id ) )

  res.status( 200 ).json( { job } )
}
