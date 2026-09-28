import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// the test server's data folder, fresh per run; set once here and inherited by the server and the test workers
process.env.CA2_E2E_DIR ??= mkdtempSync(join(tmpdir(), 'ca2-e2e-'))

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173/', viewport: { width: 1400, height: 900 } },
  webServer: { command: 'node e2e/serve.mjs', port: 4173, reuseExistingServer: false, env: { CA2_E2E_DIR: process.env.CA2_E2E_DIR } },
  workers: 1,
})
