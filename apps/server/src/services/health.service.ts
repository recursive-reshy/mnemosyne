// Shared
import type { HealthKind } from '@mnemosyne/shared'
// Logging
import { logger } from '../logger.js'
// Repositories
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'

export type HealthSubject = { kind: HealthKind, id: string }
export type CheckResult = { ok: true, detail?: string } | { ok: false, message: string }

export const recordCheck = (
  { kind, id }: HealthSubject,
  result: CheckResult,
  at: string = new Date().toISOString(),
): void => {
  if( result.ok ) {
    recordSuccess( kind, id, at, result.detail )

    return
  }

  recordFailure( kind, id, at, result.message )
  logger.warn( { kind, subject_id: id }, 'Health check failed' )
}
