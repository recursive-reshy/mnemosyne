// Packages
import { afterEach, beforeEach } from 'vitest'
// Repositories
import { closeJobStore, openJobStore } from '../repositories/jobStore.repository.js'

beforeEach( () => {
  openJobStore( ':memory:' )
} )

afterEach( () => {
  closeJobStore()
} )
