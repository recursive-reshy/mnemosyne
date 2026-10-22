// Shared
import type { HealthKind } from '@mnemosyne/shared'
// Repositories
import { recordFailure, recordSuccess } from '../repositories/health.repository.js'

// Gives a feed or Gmail source the check data its row used to carry before migration 8.
export const seedCheck = (
  kind: HealthKind,
  id: string,
  checkedAt: string | null,
  error: string | null,
): void => {
  if( checkedAt === null ) {
    return
  }

  if( error === null ) {
    recordSuccess( kind, id, checkedAt )
  } else {
    recordFailure( kind, id, checkedAt, error )
  }
}
