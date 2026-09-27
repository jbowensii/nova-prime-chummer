// Test server: the real server over dist/, with an empty characters folder per run.
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createServer } from '../server/server.mjs'

const dir = mkdtempSync(join(tmpdir(), 'ca2-e2e-'))
createServer({ staticDir: 'dist', charDir: join(dir, 'characters'), customDir: join(dir, 'custom') })
  .listen(4173, () => console.log(`e2e server on :4173, characters in ${dir}`))
