// @vitest-environment node
// Every route family server/*.mjs serves, with the role server/auth.mjs need() must give it. need() is a default-deny
// table (public is an explicit allowlist, anything unlisted falls through to 'user'), so a new route has to be added
// here, with a decision: a family the server serves but this table lacks fails the test.
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { need } from '../../server/auth.mjs'

type Role = 'public' | 'user' | 'editor' | 'admin'
const R = (role: Role, ...routes: string[]): [Role, string][] => routes.map(r => [role, r])

// 'METHOD /path'. Each row is also checked under the /api/sr6 prefix (a game's route needs what the plain one needs).
const TABLE: [Role, string][] = [
  // public: exactly this list
  ...R('public', 'GET /api/health', 'GET /api/auth/me', 'GET /api/auth/oidc/start', 'GET /api/auth/oidc/callback'),
  ...R('public', 'POST /api/auth/login', 'POST /api/setup', 'POST /api/setup/reset'),
  // admin
  ...R('admin', 'GET /api/books', 'POST /api/books', 'POST /api/books/reimport-all', 'DELETE /api/books/abc', 'GET /api/review'),
  ...R('admin', 'GET /api/ai-settings', 'PUT /api/ai-settings', 'PUT /api/ai-keys', 'GET /api/ai-models', 'POST /api/ai-test'),
  ...R('admin', 'POST /api/backup', 'POST /api/restore', 'POST /api/datapack', 'POST /api/datapack/import'),
  ...R('admin', 'GET /api/cloud-backup', 'POST /api/cloud-backup', 'POST /api/cloud-backup/restore'),
  ...R('admin', 'GET /api/users', 'POST /api/users', 'PUT /api/users/abc', 'DELETE /api/users/abc'),
  ...R('admin', 'GET /api/auth-settings', 'PUT /api/auth-settings', 'POST /api/auth-settings/test'),
  ...R('admin', 'GET /api/setup-config', 'PUT /api/setup-config', 'PUT /api/setup-config/systems/sr6/enabled', 'POST /api/setup-config/systems/sr6/install'),
  ...R('admin', 'PUT /api/creation', 'POST /api/creation', 'POST /api/backgrounds', 'PUT /api/backgrounds/abc', 'DELETE /api/backgrounds/abc'),
  // editor (admin or editor)
  ...R('editor', 'PUT /api/edits', 'POST /api/edits/abc', 'DELETE /api/edits/abc', 'PUT /api/table-rules', 'POST /api/table-rules'),
  ...R('editor', 'GET /api/npcs', 'PUT /api/npcs/abc', 'DELETE /api/npcs/abc', 'GET /api/npcs/trash'),
  ...R('editor', 'GET /api/compendiums', 'PUT /api/compendiums/abc', 'DELETE /api/compendiums/abc', 'POST /api/campaigns'),
  // user: any signed-in account. Each family here is on purpose; a new one must be added by a decision, not by default.
  ...R('user', 'GET /api/creation', 'GET /api/backgrounds', 'GET /api/edits', 'GET /api/edits/sources', 'GET /api/table-rules'),
  ...R('user', 'GET /api/samples', 'PUT /api/samples', 'GET /api/compendiums/shared'),
  ...R('user', 'GET /api/campaigns', 'GET /api/campaigns/abc', 'PUT /api/campaigns/abc', 'DELETE /api/campaigns/abc'),
  ...R('user', 'GET /api/characters', 'PUT /api/characters/abc', 'DELETE /api/characters/abc'),
  ...R('user', 'GET /api/designs', 'PUT /api/designs/abc', 'DELETE /api/designs/abc'),
  ...R('user', 'GET /api/trash', 'POST /api/trash/abc/restore', 'GET /api/designs/trash'),
  ...R('user', 'POST /api/auth/logout', 'POST /api/auth/password', 'POST /api/auth/oidc/link/start', 'GET /api/ask', 'POST /api/ask'),
]

test.each(
  TABLE.flatMap(([role, r]) => [
    [role, r, r],
    [role, r, r.replace(' /api/', ' /api/sr6/')],
  ]),
)('%s: %s', (role, row) => {
  const [method, path] = String(row).split(' ')
  expect(need(path, method)).toBe(role)
})

test('every /api route family the server serves is in the table', () => {
  const dir = resolve(__dirname, '../../server')
  const served = new Set<string>()
  for (const f of readdirSync(dir).filter(f => f.endsWith('.mjs'))) {
    const code = readFileSync(join(dir, f), 'utf8')
      .split('\n')
      .filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    // '/api/x' string literals and /^\/api\/x/ regexes; ponytail: a family named only inside an alternation group
    // (e.g. (npcs\/|designs\/)?trash) is not seen, so `trash` and `review` are listed in the table by hand
    for (const m of code.matchAll(/['"`]\/api\/([\w-]+)|\\\/api\\\/([\w-]+)/g)) served.add(m[1] ?? m[2])
  }
  served.delete('sr6') // the prefix, handled by scoped()
  const known = new Set(TABLE.map(([, r]) => r.split(' ')[1].split('/')[2]))
  expect([...served].filter(s => !known.has(s))).toEqual([])
})
