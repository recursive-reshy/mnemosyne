// Testing Library
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
// Vitest
import { afterEach } from 'vitest'

afterEach( () => {
  cleanup()
} )
