// Packages
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
    environment: 'jsdom',
    setupFiles: [ './src/test-support/setup.ts' ],
    include: [ 'src/**/*.test.{ts,tsx}' ],
  },
} )
