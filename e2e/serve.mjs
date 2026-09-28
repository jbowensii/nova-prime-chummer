// Test server: the real server over dist/, with an empty characters folder and Library per run, a fresh
// copy of the made-up imported books (tests/fixtures/mini/custom) as the custom folder, and a stub
// worker (tests/fixtures/stub-worker.mjs) in place of `python -m importer`.
import { cpSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from '../server/server.mjs'

const dir = process.env.CA2_E2E_DIR ?? mkdtempSync(join(tmpdir(), 'ca2-e2e-')) // playwright.config.ts makes one per run
cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
  python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  .listen(4173, () => console.log(`e2e server on :4173, characters, custom and library in ${dir}`))
