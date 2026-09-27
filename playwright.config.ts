import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173/', viewport: { width: 1400, height: 900 } },
  webServer: { command: 'node e2e/serve.mjs', port: 4173, reuseExistingServer: false },
  workers: 1,
})
