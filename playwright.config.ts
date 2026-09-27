import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173/', viewport: { width: 1400, height: 900 } },
  webServer: { command: 'npx vite preview --port 4173 --strictPort', port: 4173, reuseExistingServer: true },
})
