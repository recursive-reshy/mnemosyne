// Shared
import { ModuleId } from '@mnemosyne/shared'
import type { AdminUser, CreateUserBody, UpdateUserBody } from '@mnemosyne/shared'
// Errors
import { ConflictError, NotFoundError, ValidationError } from '../errors.js'
// Repositories
import { inTransaction } from '../repositories/database.js'
import { deleteSessionsForUser } from '../repositories/sessions.repository.js'
import { listModules, setModules } from '../repositories/userModules.repository.js'
import {
  clearVaultDir,
  deleteUser,
  findUserById,
  insertUser,
  listUsers,
  updateUser,
} from '../repositories/users.repository.js'
import type { StoredUser } from '../repositories/users.repository.js'
// Services
import { seedUser } from './seedUser.service.js'

const toAdminUser = ( user: StoredUser ): AdminUser => ( {
  id: user.id,
  email: user.email,
  name: user.name,
  role: user.role,
  status: user.status,
  modules: user.role === 'admin' ? ModuleId.options : listModules( user.id ),
  vault_dir: user.vault_dir,
  last_signin_at: user.last_signin_at,
  created_at: user.created_at,
} )

// The admin can't be changed here, and nobody else is found by an unknown ID
const targetOf = ( adminId: string, id: string ): StoredUser => {
  const user = findUserById( id )

  if( user === undefined ) {
    throw new NotFoundError( 'User not found' )
  }

  if( user.id === adminId ) {
    throw new ConflictError( 'You can\'t change your own account here' )
  }

  return user
}

export const listAdminUsers = (): AdminUser[] => listUsers().map( toAdminUser )

export const createUser = ( body: CreateUserBody, now: Date ): AdminUser => {
  const id = crypto.randomUUID()

  return inTransaction( () => {
    const inserted = insertUser( {
      id,
      email: body.email,
      name: body.name,
      role: 'member',
      status: 'active',
      created_at: now.toISOString(),
    } )

    if( !inserted.ok ) {
      throw new ConflictError( 'That email is already a user' )
    }

    setModules( id, body.modules )
    seedUser( id, now.toISOString() )

    const created = findUserById( id )

    if( created === undefined ) {
      throw new NotFoundError( 'User not found' )
    }

    return toAdminUser( created )
  } )
}

export const changeUser = ( adminId: string, id: string, body: UpdateUserBody ): AdminUser => {
  targetOf( adminId, id )

  return inTransaction( () => {
    updateUser( id, { name: body.name, status: body.status } )

    if( body.modules !== undefined ) {
      setModules( id, body.modules )
    }

    if( body.status === 'removed' ) {
      deleteSessionsForUser( id )
    }

    return toAdminUser( targetOf( adminId, id ) )
  } )
}

export const resetVault = ( adminId: string, id: string ): AdminUser => {
  targetOf( adminId, id )
  clearVaultDir( id )

  return toAdminUser( targetOf( adminId, id ) )
}

export const deleteUserAccount = ( adminId: string, id: string, confirm: string ): void => {
  const user = targetOf( adminId, id )

  if( user.status !== 'removed' ) {
    throw new ConflictError( 'Remove the user before deleting them' )
  }

  if( confirm !== user.email ) {
    throw new ValidationError( 'Type the user\'s email to confirm' )
  }

  deleteUser( id )
}
