// Regression tests for the 1.0.0 career / charxml / pack fixes: repeatable leveled qualities, SIN lifestyle packs, life-module
// lines, clearHistory, graded add-ons, pack accessories and the id migration of fit / unfit / pack lines.
import { expect, test } from 'vitest'
import { clearHistory, currentBuild, preview, record } from '../../../src/sr6/runner-builder/domain/career/career'
import { migrateSr6Ids } from '../../../src/sr6/runner-builder/domain/career/migrate'
import { priced } from '../../../src/sr6/runner-builder/domain/creation/budgets'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { blankSr6, type Sr6Character, type Sr6Purchase } from '../../../src/sr6/formats/domain/character'
import { buildOf, fixtureCatalog, GLIM, made } from '../catalog/fixture'

const NOW = '2026-10-06T10:00:00.000Z'
function runner(): Sr6Character {
  const ch = blankSr6('karma', 'c1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM })
  ch.identity.metatype = GLIM
  ch.finalizedAt = NOW
  ch.final = { karma: 200, nuyen: 50000 }
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 200, nuyen: 50000 }]
  return ch
}
const ok = (r: ReturnType<typeof record>) => {
  if (!r.ok) throw new Error(r.reason)
  return r.ch
}
const buy = (id: string, o: Partial<Sr6Purchase> = {}): Sr6Purchase => ({ uid: 'x', kind: 'gear', id, qty: 1, accessories: [], ...o })

test('a second choice of a repeatable leveled quality is its own line; raising one leaves the other', () => {
  const { data, cr } = made({
    data: d => {
      for (const n of [1, 2, 3]) d.qualities[`crb.lucky-streak.${n}`].multi = true
    },
  })
  const q = (id: string, note: string) => ({ op: 'quality' as const, line: { uid: '', id, level: 1, note } })
  let ch = ok(record(runner(), q('crb.lucky-streak.1', 'Sleaze'), data, cr, undefined, NOW))
  ch = ok(record(ch, q('crb.lucky-streak.1', 'Attack'), data, cr, undefined, NOW))
  const [a, b] = currentBuild(ch).qualities
  expect(currentBuild(ch).qualities).toHaveLength(2)
  ch = ok(record(ch, { ...q('crb.lucky-streak.2', 'Attack'), target: b.uid }, data, cr, undefined, NOW))
  expect(currentBuild(ch).qualities.map(x => [x.id, x.note])).toEqual([
    ['crb.lucky-streak.1', 'Sleaze'],
    ['crb.lucky-streak.2', 'Attack'],
  ])
  expect(currentBuild(ch).qualities[0].uid).toBe(a.uid)
})

test('a SIN keeps its lifestyle pack and a life module its knowledge lines through the file', () => {
  const ch = runner()
  ch.build.sins = [{ uid: 's1', name: '', kind: 'real', licences: [], lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 1, pack: 'p1' }] }]
  ch.build.lifepath = [{ id: 'm1', choices: { 0: 'edg', 1: 'skill:x' }, lines: { 1: 'k1' } }]
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.build.sins[0].lifestyles?.[0].pack).toBe('p1')
  expect(back.ok && back.character.build.lifepath).toEqual(ch.build.lifepath)
})

test('clearHistory keeps up to the last Finalize', () => {
  const ch = runner()
  ch.ledger = [
    { id: 'f1', at: NOW, type: 'finalize', karma: 1, nuyen: 1 },
    { id: 'n1', at: NOW, type: 'note', text: 'a' },
    { id: 'f2', at: NOW, type: 'finalize', karma: 1, nuyen: 1 },
    { id: 'n2', at: NOW, type: 'note', text: 'b' },
  ]
  expect(clearHistory(ch).ledger.map(e => e.id)).toEqual(['f1', 'n1', 'f2'])
})

test('an add-on on a graded implant is priced at the implant’s grade when fitted', () => {
  const { data, cr } = made()
  const ch = runner()
  ch.build.purchases.push({ uid: 'h', kind: 'augmentations', id: 'crb.glow-eyes.1', qty: 1, grade: 'alpha', accessories: [] })
  const acc = { uid: '', kind: 'augmentations' as const, id: 'crb.glare-filter', qty: 1, accessories: [] }
  const pv = preview(ch, { op: 'fit', target: 'h', line: acc }, data, cr)
  const alpha = priced({ ...acc, grade: 'alpha' }, data, cr)
  expect(pv).toMatchObject({ ok: true, nuyen: alpha.cost })
  expect(alpha.cost).toBeGreaterThan(priced(acc, data, cr).cost)
})

test('a pack line is free but an accessory the player fits to it is paid', () => {
  const { data, cr } = made()
  const gun = buy('crb.zap-gun', { uid: 'u', pack: 'p', accessories: [buy('crb.zap-scope', { uid: 'a', pack: 'p' })] })
  const paid = { ...gun, accessories: [...gun.accessories, buy('crb.zap-scope', { uid: 'b' })] }
  expect(priced(gun, data, cr).cost).toBe(0)
  expect(priced(paid, data, cr).cost).toBe(priced(buy('crb.zap-scope'), data, cr).cost)
})

test('the id migration reaches fit, unfit and pack ledger lines', () => {
  const old = buy('crb.fizz-rounds')
  const ch = runner()
  ch.ledger.push(
    { id: 'e1', at: NOW, type: 'advance', advance: { op: 'fit', target: 'h', line: old }, label: '', karma: 0, nuyen: 0 },
    { id: 'e2', at: NOW, type: 'advance', advance: { op: 'unfit', target: 'h', line: old }, label: '', karma: 0, nuyen: 0 },
    {
      id: 'e3',
      at: NOW,
      type: 'advance',
      advance: { op: 'pack', uid: 'p', id: 'x', name: 'x', cost: 0, lines: [old], sins: [], lifestyles: [] },
      label: '',
      karma: 0,
      nuyen: 0,
    },
  )
  const out = migrateSr6Ids(ch, fixtureCatalog())
  const kinds = out.ledger.slice(1).map(e => {
    const a = (e as { advance: { line?: Sr6Purchase; lines?: Sr6Purchase[] } }).advance
    return (a.line ?? a.lines![0]).kind
  })
  expect(kinds).toEqual(['ammotypes', 'ammotypes', 'ammotypes']) // (the fixture moves it from gear)
})
