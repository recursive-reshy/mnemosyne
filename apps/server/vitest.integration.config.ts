import { defineConfig } from 'vitest/config'

export default defineConfig( {
  resolve: {
    conditions: [ 'development' ],
  },
  test: {
    include: [ 'src/**/*.integration.test.ts' ],
    passWithNoTests: true,
    testTimeout: 600_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
} )
