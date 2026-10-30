// @vitest-environment node
// server/sr6clear.mjs: only SR6 runner files whose root carries a sampleKey (loaded book copies) move, backup first, then to
// _to_delete/cleared-samples-<stamp>/ with moves.csv; PCs, hand-made NPCs, .trash/, imported/ and Anarchy stay. Made-up files.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { clearApply, clearPlan, csvField } from '../../server/sr6clear.mjs'

test('moves only the sampleKey copies of the chosen SR6 store', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ca2-sr6-clear-'))
  const sys = join(root, 'Data', 'systems'),
    sr6 = join(sys, 'sr6')
  const put = (p: string, t: string) => {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, t)
  }
  const copy = '<?xml version="1.0"?>\n<character sampleKey="CRB|face"><name>x</name></character>'
  const own = '<?xml version="1.0"?>\n<character><note>sampleKey="in text only"</note></character>'
  put(join(sr6, 'npcs', 'admin', 'ganger.xml'), copy)
  put(join(sr6, 'npcs', 'admin', 'mine.xml'), own)
  put(join(sr6, 'npcs', 'eve', 'dog.xml'), copy)
  put(join(sr6, 'npcs', '.trash', 'old.xml'), copy)
  put(join(sr6, 'characters', 'admin', 'face.xml'), copy)
  put(join(sr6, 'characters', 'admin', 'pc.xml'), own)
  put(join(sr6, 'imported', 'crb', 'npcs.xml'), copy)
  put(join(sys, 'anarchy2', 'npcs', 'admin', 'a.xml'), copy)
  const opts = { base: root, backups: join(root, 'Backups'), trash: join(root, '_to_delete'), stamp: '20261030-120000' }

  const plan = await clearPlan(join(sr6, 'npcs'))
  expect(plan.users).toEqual([
    { user: 'admin', count: 1 },
    { user: 'eve', count: 1 },
  ])
  expect(plan.kept).toBe(1)
  const r = await clearApply(join(sr6, 'npcs'), opts)
  expect(r.moved).toBe(2)
  const gone = join(root, '_to_delete', 'cleared-samples-20261030-120000')
  for (const rel of [join('npcs', 'admin', 'ganger.xml'), join('npcs', 'eve', 'dog.xml')]) {
    expect(existsSync(join(sr6, rel))).toBe(false)
    expect(existsSync(join(gone, 'Data', 'systems', 'sr6', rel))).toBe(true)
    expect(existsSync(join(root, 'Backups', 'sr6-pre-clear-20261030-120000', 'Data', 'systems', 'sr6', rel))).toBe(true)
  }
  const csv = readFileSync(join(gone, 'moves.csv'), 'utf8').trim().split('\n')
  expect(csv[0]).toBe('from,to')
  expect(csv).toHaveLength(3)
  expect(csv[1]).toContain(join(sr6, 'npcs'))

  await clearApply(join(sr6, 'characters'), { ...opts, stamp: '20261030-120001' })
  expect(existsSync(join(sr6, 'characters', 'admin', 'face.xml'))).toBe(false)

  for (const p of [
    join(sr6, 'npcs', 'admin', 'mine.xml'),
    join(sr6, 'npcs', '.trash', 'old.xml'),
    join(sr6, 'characters', 'admin', 'pc.xml'),
    join(sr6, 'imported', 'crb', 'npcs.xml'),
    join(sys, 'anarchy2', 'npcs', 'admin', 'a.xml'),
  ])
    expect(existsSync(p)).toBe(true)
})

test('moves.csv fields are RFC 4180 quoted: a comma or quote in a path survives', () => {
  expect(csvField('C:\\a\\Smith, Jo.xml')).toBe('"C:\\a\\Smith, Jo.xml"')
  expect(csvField('say "hi".xml')).toBe('"say ""hi"".xml"')
  expect(csvField('plain.xml')).toBe('plain.xml')
})
