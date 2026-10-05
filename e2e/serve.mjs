// Test server: the real server over dist/, with an empty characters folder and Library per run, a fresh
// copy of the made-up imported books (tests/fixtures/mini/custom) as the custom folder, and a stub
// worker (tests/fixtures/stub-worker.mjs) in place of `python -m importer`. The Library starts with one admin account
// (a random password, written to e2e-admin.json in the run's folder); e2e/signin.setup.ts signs in with it before the tests.
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { usersFile } from '../server/auth.mjs'
import { createServer } from '../server/server.mjs'

const dir = process.env.CA2_E2E_DIR ?? mkdtempSync(join(tmpdir(), 'ca2-e2e-')) // playwright.config.ts makes one per run
cpSync('tests/fixtures/mini/custom', join(dir, 'custom'), { recursive: true })
const admin = { username: 'admin', password: randomBytes(18).toString('base64url') }
mkdirSync(join(dir, 'library', '.config'), { recursive: true })
writeFileSync(join(dir, 'library', '.config', 'users.xml'), await usersFile([admin]))
writeFileSync(join(dir, 'e2e-admin.json'), JSON.stringify(admin))
// SR6's gallery as if the admin had deleted its default circuit board: pages without art, as the tests expect
// (e2e/backgrounds.spec.ts, on a server of its own, checks the default)
mkdirSync(join(dir, 'library', 'sr6', 'backgrounds'), { recursive: true })
writeFileSync(join(dir, 'library', 'sr6', 'backgrounds', 'backgrounds.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<ca2:backgrounds xmlns:ca2="urn:chummer-anarchy2:config:1" version="1" seeded="true">\n</ca2:backgrounds>\n')
createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom'), libraryDir: join(dir, 'library'),
  python: [process.execPath, 'tests/fixtures/stub-worker.mjs'] })
  .listen(4173, () => console.log(`e2e server on :4173, characters, custom and library in ${dir}`))
