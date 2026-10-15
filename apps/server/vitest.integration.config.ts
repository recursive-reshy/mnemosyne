// Node
import { existsSync } from 'node:fs'
// Packages
import { defineConfig } from 'vitest/config'

// Integration tests need the same .env the dev server reads (ANTHROPIC_API_KEY).
if( existsSync( '.env' ) ) {
  process.loadEnvFile( '.env' )
}

export default defineConfig( {
  resolve: {
    conditions: [ 'development' ],
  },
  test: {
    setupFiles: [ './src/test-support/jobStore.setup.ts' ],
    include: [ 'src/**/*.integration.test.ts' ],
    passWithNoTests: true,
    testTimeout: 600_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
} )
