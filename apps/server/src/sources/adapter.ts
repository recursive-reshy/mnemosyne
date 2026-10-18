// Shared
import type { Job, SourceDocument } from '@mnemosyne/shared'
// Services
import type { StepStatus } from '../services/jobs.service.js'

export interface AdapterContext {
  job: Job
  workDir: string
  markStatus: ( status: StepStatus ) => void
}

export interface SourceAdapter {
  acquire: ( context: AdapterContext ) => Promise< SourceDocument >
}
