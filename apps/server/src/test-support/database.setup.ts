// Packages
import { afterEach, beforeEach } from 'vitest'
// Repositories
import { closeDatabase, openDatabase } from '../repositories/database.js'

beforeEach( () => {
  openDatabase( ':memory:' )
} )

afterEach( () => {
  closeDatabase()
} )
