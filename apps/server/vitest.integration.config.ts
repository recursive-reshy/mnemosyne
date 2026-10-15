import { defineConfig } from 'vitest/config'

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
