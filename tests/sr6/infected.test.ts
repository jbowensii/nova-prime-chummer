// The Sixth World Companion's Infected player characters (an optional rule, p. 104), on the made-up fixture: an entry whose
// class starts with INFECTED (an Infected quality, Commlink6's INFECTED, or an optional power, INFECTED/OPTIONAL_POWER) is
// hidden and refused while the table's infectedAllowed is off (the default), and bought with Karma at its own price, at
// creation and after (not doubled after creation, p. 106), while it is on. Invented names and prices.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { preview } from '../../src/sr6/engine/career'
import { infectedOff } from '../../src/sr6/engine/critterware'
import { flag, num } from '../../src/sr6/engine/creation'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankSr6 } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from './fixture'

const MORE = [
  '<quality id="crb.zap-ghoul" source="CRB" page="70" kind="positive" karma="20" class="INFECTED"><name>Zap Ghoul</name><text/></quality>',
  '<quality id="crb.zap-power.glow" source="CRB" page="70" kind="positive" karma="6" category="Zap Optional Powers" class="INFECTED/OPTIONAL_POWER"><name>Glow</name><text/></quality>',
].join('\n')
const data = sr6Data(fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('</sr6:data>', `${MORE}\n</sr6:data>`) : x)))
const rules = (on?: boolean) => {
  const cr = fixtureCreation()
  if (on !== undefined) cr.set('infectedAllowed', { key: 'infectedAllowed', value: on })
  return cr
}
const career = () => {
  const ch = blankSr6('karma', 'i1', '2026-10-16T00:00:00Z')
  ch.build = buildOf('karma', { metatype: GLIM })
  ch.finalizedAt = '2026-10-16T00:00:00Z'
  ch.final = { karma: 100, nuyen: 0 }
  ch.ledger = [{ id: 'f1', at: ch.finalizedAt, type: 'finalize', karma: 100, nuyen: 0 }]
  return ch
}
const q = (id: string) => ({ op: 'quality' as const, line: { uid: '', id, level: 1 } })

test('off by default: the Infected entries are hidden, and refused at creation and after; another quality is not', () => {
  const cr = rules()
  expect(flag(cr, 'infectedAllowed')).toBeUndefined()
  for (const id of ['crb.zap-ghoul', 'crb.zap-power.glow']) {
    expect(infectedOff(data.entry('qualities', id), cr), id).toBe(true)
    expect(apply(buildOf('karma', { metatype: GLIM }), { op: 'quality', id }, data, cr), id).toEqual({ ok: false, reason: 'rule-off' })
    expect(preview(career(), q(id), data, cr), id).toEqual({ ok: false, reason: 'optional-rule-off' })
  }
  expect(infectedOff(data.entry('qualities', 'crb.butterfingers'), cr)).toBe(false)
  expect(infectedOff(data.entry('qualities', 'crb.zap-ghoul'), rules(false))).toBe(true)
})

test('on: taken at creation, and bought after at its own Karma (no quality factor)', () => {
  const cr = rules(true)
  const b = buildOf('karma', { metatype: GLIM })
  expect(apply(b, { op: 'quality', id: 'crb.zap-power.glow' }, data, cr)).toEqual({ ok: true })
  expect(b.qualities.map(x => x.id)).toEqual(['crb.zap-power.glow'])
  expect(num(cr, 'advance.qualityFactor')).toBe(3)
  expect(preview(career(), q('crb.zap-ghoul'), data, cr)).toMatchObject({ ok: true, karma: 20 })
  expect(preview(career(), q('crb.zap-power.glow'), data, cr)).toMatchObject({ ok: true, karma: 6 })
})

test('a runner keeps an Infected quality it has when the rule goes off (its note can still change)', () => {
  const b = buildOf('karma', { metatype: GLIM })
  apply(b, { op: 'quality', id: 'crb.zap-ghoul' }, data, rules(true))
  expect(apply(b, { op: 'quality', id: 'crb.zap-ghoul', uid: b.qualities[0].uid, note: 'strain I' }, data, rules())).toEqual({ ok: true })
  expect(b.qualities[0].note).toBe('strain I')
})
