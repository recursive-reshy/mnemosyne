import { defineConfig } from 'vitest/config'

export default defineConfig( {
  resolve: {
    conditions: [ 'development' ],
  },
  test: {
    setupFiles: [ './src/test-support/jobStore.setup.ts' ],
    include: [ 'src/**/*.test.ts' ],
    exclude: [ 'src/**/*.integration.test.ts' ],
  },
} )
