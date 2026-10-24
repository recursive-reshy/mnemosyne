// Packages
import { afterEach, beforeEach } from 'vitest'
// Repositories
import { closeDatabase, openDatabase } from '../repositories/database.js'
// Services
import { seedSharedProfiles } from '../services/seedUser.service.js'

// Prompt profiles have no owner until task 4.1, so every test starts with the shared seeded rows,
// as openDatabase used to leave them. Task 4.1 removes this call.
beforeEach( () => {
  openDatabase( ':memory:' )
  seedSharedProfiles( new Date().toISOString() )
} )

afterEach( () => {
  closeDatabase()
} )
