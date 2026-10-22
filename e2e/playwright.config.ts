import { defineConfig, devices } from '@playwright/test'

export default defineConfig( {
  testDir: './tests',
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3101',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices[ 'Desktop Chrome' ] } },
  ],
} )
