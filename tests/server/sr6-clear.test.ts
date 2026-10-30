// @vitest-environment node
// server/sr6clear.mjs: the SR6 admin clears move only their targets (backup copy first, then _to_delete), rewrite the
// imported index and samples list, and leave characters/, edits/, critterpowers.xml and Anarchy alone. Made-up files.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { clearApply, clearPlan } from '../../server/sr6clear.mjs'

test('clears NPCs/critters and samples, keeping everything else', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ca2-sr6-clear-'))
  const sr6 = join(root, 'Data', 'systems', 'sr6'),
    imp = join(sr6, 'imported'),
    anarchy = join(root, 'Data', 'systems', 'anarchy2', 'imported', 'crb')
  const put = (p: string, t = '<x/>') => {
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, t)
  }
  for (const b of ['crb', 'ff']) {
    put(join(imp, b, 'npcs.xml'))
    put(join(imp, b, 'critters.xml'))
    put(join(imp, b, 'gear.xml'))
    put(join(imp, b, 'samples', 'face.xml'))
  }
  put(join(imp, 'crb', 'critterpowers.xml'))
  put(join(imp, 'samples.xml'), '<samples>\n  <sample source="CRB" href="crb/samples/face.xml" name="Face"/>\n</samples>\n')
  put(join(sr6, 'characters', 'me.xml'))
  put(join(sr6, 'edits', 'items.xml'))
  put(join(anarchy, 'npcs.xml'))
  put(join(anarchy, 'samples', 'a.xml'))
  const opts = { backups: join(root, 'Backups'), trash: join(root, '_to_delete'), stamp: '20261030-1200' }

  expect((await clearPlan(sr6, 'npcs')).map((t: { rel: string }) => t.rel)).toEqual(['crb/npcs.xml', 'crb/critters.xml', 'ff/npcs.xml', 'ff/critters.xml'])
  const r = await clearApply(sr6, 'npcs', opts)
  expect(r.moved).toHaveLength(4)
  for (const rel of ['crb/npcs.xml', 'ff/critters.xml']) {
    expect(existsSync(join(imp, rel))).toBe(false)
    expect(existsSync(join(root, 'Backups', 'sr6-pre-clear-20261030-1200', 'imported', rel))).toBe(true)
    expect(existsSync(join(root, '_to_delete', 'sr6-cleared-20261030-1200', 'imported', rel))).toBe(true)
  }
  const index = readFileSync(join(imp, 'index.xml'), 'utf8')
  expect(index).toContain('crb/critterpowers.xml')
  expect(index).toContain('ff/gear.xml')
  expect(index).not.toContain('npcs.xml')

  await clearApply(sr6, 'samples', { ...opts, stamp: '20261030-1201' })
  expect(existsSync(join(imp, 'crb', 'samples'))).toBe(false)
  expect(existsSync(join(root, '_to_delete', 'sr6-cleared-20261030-1201', 'imported', 'crb', 'samples', 'face.xml'))).toBe(true)
  expect(existsSync(join(root, 'Backups', 'sr6-pre-clear-20261030-1201', 'imported', 'ff', 'samples', 'face.xml'))).toBe(true)
  expect(readFileSync(join(imp, 'samples.xml'), 'utf8')).not.toContain('<sample ')

  for (const p of [
    join(imp, 'crb', 'critterpowers.xml'),
    join(sr6, 'characters', 'me.xml'),
    join(sr6, 'edits', 'items.xml'),
    join(anarchy, 'npcs.xml'),
    join(anarchy, 'samples', 'a.xml'),
  ])
    expect(existsSync(p)).toBe(true)
  expect(await clearPlan(sr6, 'npcs')).toEqual([])
})
