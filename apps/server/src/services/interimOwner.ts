// Repositories
import { listUsers } from '../repositories/users.repository.js'

// INTERIM (checkpoint C, removed in 4.6): background code that has no row to read an owner from
// yet acts for the admin. Each task of Phase 4 replaces a call site with the row's own user_id.
export const interimOwnerId = (): string => {
  const admin = listUsers().find( ( { role, status } ) => role === 'admin' && status === 'active' )

  if( admin === undefined ) {
    throw new Error( 'There is no admin to act for' )
  }

  return admin.id
}
