import { defineConfig } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// the test server's data folder, fresh per run; set once here and inherited by the server and the test workers
process.env.CA2_E2E_DIR ??= mkdtempSync(join(tmpdir(), 'ca2-e2e-'))

// E2E_PORT: another port when 4173 is taken (the server reads it too: e2e/serve.mjs)
const port = Number(process.env.E2E_PORT ?? 4173)

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: `http://localhost:${port}/`, viewport: { width: 1400, height: 900 } },
  webServer: { command: 'node e2e/serve.mjs', port, reuseExistingServer: false, env: { CA2_E2E_DIR: process.env.CA2_E2E_DIR, E2E_PORT: String(port) } },
  workers: 1,
  // every test starts signed in as the admin the e2e server seeds (e2e/session.ts)
  projects: [
    { name: 'signin', testMatch: /signin\.setup\.ts/ },
    { name: 'app', dependencies: ['signin'], use: { storageState: join(process.env.CA2_E2E_DIR, 'e2e-state.json') } },
  ],
})
