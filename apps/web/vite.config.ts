// Packages
import { playwright } from '@vitest/browser-playwright'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig( {
  plugins: [ react() ],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:3100',
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'jsdom',
          setupFiles: [ './src/test-support/setup.ts' ],
          include: [ 'src/**/*.test.{ts,tsx}' ],
          exclude: [ 'src/**/*.browser.test.tsx' ],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          setupFiles: [ './src/test-support/browser.setup.ts' ],
          include: [ 'src/**/*.browser.test.tsx' ],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [ { browser: 'chromium' }, { browser: 'webkit' } ],
          },
        },
      },
    ],
  },
} )
