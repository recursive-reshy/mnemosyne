// Node
import { randomUUID } from 'node:crypto'
// Express
import type { Express } from 'express'
// Packages
import supertest from 'supertest'
// Shared
import { ModuleId } from '@mnemosyne/shared'
import type { Role } from '@mnemosyne/shared'
// Middleware
import { SESSION_COOKIE } from '../services/session.service.js'
// Repositories
import { setModules } from '../repositories/userModules.repository.js'
import { findUserById, insertUser, setVaultDir } from '../repositories/users.repository.js'
// Services
import { createSession } from '../services/session.service.js'
import { seedUser } from '../services/seedUser.service.js'

export type TestUser = {
  id: string
  email: string
  role: Role
  token: string
}

export type TestUserOptions = {
  role?: Role
  modules?: ModuleId[]
  vault_dir?: string | null
  email?: string
}

// Inserts a user (and a session for them) in the current test database
export const createTestUser = ( options: TestUserOptions = {} ): TestUser => {
  const id = randomUUID()
  const email = options.email ?? `${ id }@example.com`
  const role = options.role ?? 'member'
  const now = new Date()

  insertUser( {
    id,
    email,
    name: `Test ${ role }`,
    role,
    status: 'active',
    created_at: now.toISOString(),
  } )
  setModules( id, role === 'admin' ? [] : options.modules ?? [ ...ModuleId.options ] )

  if( options.vault_dir !== undefined && options.vault_dir !== null ) {
    setVaultDir( id, options.vault_dir )
  }

  seedUser( id, now.toISOString() )

  return { id, email, role, token: createSession( id, now ).token }
}

export const cookieFor = ( user: TestUser ): string => `${ SESSION_COOKIE }=${ user.token }`

let cached: TestUser | undefined

// The admin every signed-in route test acts as; made on first use, as each test has a new database
export const defaultTestAdmin = (): TestUser => {
  if( cached === undefined || findUserById( cached.id ) === undefined ) {
    cached = createTestUser( { role: 'admin', email: 'test-admin@example.com' } )
  }

  return cached
}

type Agent = ReturnType< typeof supertest.agent >

// Sends the user's session cookie, and application/json so bodyless POSTs pass `jsonOnly`
export const signedIn = ( agent: Agent, user: TestUser ): Agent => {
  return agent.set( 'Cookie', cookieFor( user ) ).set( 'Content-Type', 'application/json' )
}

// A drop-in for supertest's `request( app )` that is signed in (as the default admin unless given)
export const signedInRequest = ( app: Express, user: TestUser = defaultTestAdmin() ): Agent => {
  return signedIn( supertest.agent( app ), user )
}
