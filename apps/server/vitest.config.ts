import { defineConfig } from 'vitest/config'

export default defineConfig( {
  resolve: {
    conditions: [ 'development' ],
  },
  test: {
    env: {
      ANTHROPIC_API_KEY: 'test-key',
      VAULT_PATH: '/tmp/mnemosyne-test-vault',
      LOG_LEVEL: 'silent',
    },
    setupFiles: [ './src/test-support/database.setup.ts' ],
    include: [ 'src/**/*.test.ts' ],
    exclude: [ 'src/**/*.integration.test.ts' ],
  },
} )
