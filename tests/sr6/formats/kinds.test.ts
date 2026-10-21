// @vitest-environment node
// The SR6 catalog kinds (docs/sr6-data-format/kinds.md): the server's and the client's kind -> tag maps agree, every kind has
// its XSD, and tools/validate-data.mjs checks an SR6 custom folder (--sr6=) against SR6's schemas. Made-up fixture.
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
// @ts-expect-error plain JS module
import { SR6_KINDS as SERVER_KINDS } from '../../../server/games.mjs'
import { SR6_KINDS } from '../../../src/sr6/formats/domain/types'

vi.setConfig({ testTimeout: 30000 })
const FIXTURE = 'tests/fixtures/sr6/custom'
const validate = (dir: string) => spawnSync('node', ['tools/validate-data.mjs', `--sr6=${dir}`], { encoding: 'utf8' })

test('server and client name the same kinds with the same tags, each with its XSD', () => {
  expect(Object.keys(SERVER_KINDS)).toEqual(Object.keys(SR6_KINDS))
  for (const [kind, { tag, label }] of Object.entries(SR6_KINDS)) {
    expect(SERVER_KINDS[kind]).toBe(tag)
    expect(label).toBeTruthy()
    expect(existsSync(`public/data/sr6/schema/${kind}.xsd`), kind).toBe(true)
  }
})

test('the made-up SR6 fixture validates', () => {
  const r = validate(FIXTURE)
  expect(r.stderr).toBe('')
  expect(r.status).toBe(0)
})

test('a broken SR6 copy fails: missing category, a non-integer karma, an entry of the wrong kind', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'sr6-validate-')), 'custom')
  cpSync(FIXTURE, dir, { recursive: true })
  const edit = (f: string, from: RegExp, to: string) => {
    const p = join(dir, 'imported', 'crb', f),
      xml = readFileSync(p, 'utf8')
    expect(xml).toMatch(from)
    writeFileSync(p, xml.replace(from, to))
  }
  edit('weapons.xml', /(<weapon [^>]*?) category="[^"]*"/, '$1')
  edit('qualities.xml', /karma="[^"]*"/, 'karma="x"')
  edit('weapons.xml', /<\/sr6:data>/, '<spell id="crb.stray" source="CRB" page="2" category="combat"><name>Stray</name></spell></sr6:data>')
  const cr = join(dir, 'creation.xml')
  writeFileSync(cr, readFileSync(cr, 'utf8').replace('page="61"', 'page="0"'))
  const r = validate(dir)
  expect(r.status).toBe(1)
  const lines = r.stderr.split('\n')
  expect(lines.some(l => l.includes('creation.xml') && l.includes('page'))).toBe(true)
  expect(lines.some(l => l.includes('weapons.xml') && l.includes('category'))).toBe(true)
  expect(lines.some(l => l.includes('qualities.xml') && l.includes('karma'))).toBe(true)
  expect(lines.some(l => l.includes('weapons.xml') && l.includes('spell'))).toBe(true)
})

test('a life module choice option that is not an attribute, skill:<id> or nuyen:<number> fails', () => {
  const dir = join(mkdtempSync(join(tmpdir(), 'sr6-validate-')), 'custom')
  cpSync(FIXTURE, dir, { recursive: true })
  const p = join(dir, 'imported', 'crb', 'lifemodules.xml'),
    xml = readFileSync(p, 'utf8')
  expect(xml).toContain('nuyen:3000')
  writeFileSync(p, xml.replace('nuyen:3000', 'nuyen:x'))
  const r = validate(dir)
  expect(r.status).toBe(1)
  expect(r.stderr).toMatch(/lifemodules\.xml.*nuyen:x/)
})
