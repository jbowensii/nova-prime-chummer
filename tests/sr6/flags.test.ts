// The catalog flags (metamagic user and taking again, a spell's opposed test and Essence threshold, armor's Social) and the
// player's skill bonuses: the data view, the builder's actions, career initiation, Review, derived values, the runner file
// and the Foundry export. Made-up fixture entries only (tests/fixtures/sr6/custom: Glow Point, Hum Craft, Mend Glow).
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { currentBuild, preview, record, validateCareer } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { metamagicFits, pickMaxLevel } from '../../src/sr6/engine/data'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { entryValues, exportSr6Runners } from '../../src/sr6/engine/export'
import { canFinalizeSr6, validateSr6 } from '../../src/sr6/engine/rules'
import { armorSocial } from '../../src/sr6/engine/values'
import { blankSr6, type MagicKind, type Sr6Character } from '../../src/sr6/model/character'
import { pickFlags } from '../../src/sr6/print/view'
import { buildOf, GLIM, made } from './fixture'
import { mara, sampleWorld, SAMPLE_OPTS } from './samples'

const NOW = '2026-10-09T10:00:00.000Z'
function runner(magic: MagicKind, finalized = false): Sr6Character {
  const ch = blankSr6('karma', 'f1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM, magic })
  ch.identity.metatype = GLIM
  if (finalized) Object.assign(ch, { finalizedAt: NOW, final: { karma: 100, nuyen: 0 }, ledger: [{ id: 'l0', at: NOW, type: 'finalize', karma: 100, nuyen: 0 }] })
  return ch
}

test('the catalog flags in the data view and in words', () => {
  const { data } = made()
  expect(data.metamagics['crb.glow-point']).toMatchObject({ user: 'adept', perLevel: true, maxLevel: 3 })
  expect(data.metamagics['crb.soft-echo']).toMatchObject({ perLevel: false, maxLevel: null })
  expect(data.metamagics['crb.soft-echo']).not.toHaveProperty('user')
  expect([pickMaxLevel(data, 'metamagics', 'crb.glow-point'), pickMaxLevel(data, 'metamagics', 'crb.soft-echo')]).toEqual([3, null])
  expect(pickFlags(data.entry('metamagics', 'crb.glow-point')!)).toEqual(['Adepts only', 'Taken again (up to 3)'])
  expect(pickFlags(data.entry('spells', 'crb.glow-ward')!)).toEqual(['Opposed'])
  expect(pickFlags(data.entry('spells', 'crb.mend-glow')!)).toEqual(['Essence threshold'])
})

test('who may take a metamagic: an adept’s an adept or mystic adept, a magician’s a magician or mystic adept', () => {
  const kinds: MagicKind[] = ['full', 'aspected', 'mystic-adept', 'adept', 'technomancer', 'mundane']
  expect(kinds.filter(k => metamagicFits(k, 'adept'))).toEqual(['mystic-adept', 'adept'])
  expect(kinds.filter(k => metamagicFits(k, 'magician'))).toEqual(['full', 'aspected', 'mystic-adept'])
  expect(metamagicFits('full', undefined)).toBe(true)
})

test('a metamagic taken again goes up a level, to its most; one taken once can’t be', () => {
  const { data, cr } = made(), b = runner('adept').build
  const act = (id: string) => apply(b, { op: 'pick', kind: 'metamagics', id }, data, cr)
  expect(act('crb.glow-point')).toEqual({ ok: true })
  expect(b.picks[0]).toMatchObject({ id: 'crb.glow-point', level: 1 })
  act('crb.glow-point'); act('crb.glow-point')
  expect(b.picks[0].level).toBe(3)
  expect(act('crb.glow-point')).toEqual({ ok: false, reason: 'max-level' })
  expect(apply(b, { op: 'powerLevel', uid: b.picks[0].uid, level: 2 }, data, cr)).toEqual({ ok: true })
  expect(act('crb.soft-echo')).toEqual({ ok: true })
  expect(act('crb.soft-echo')).toEqual({ ok: false, reason: 'duplicate' })
})

test('Review: an adept’s metamagic on a magician, and more metamagics than initiation grades', () => {
  const { data, cr } = made(), ch = runner('full')
  ch.build.picks = [{ uid: 'm1', kind: 'metamagics', id: 'crb.glow-point', level: 2 }, { uid: 'm2', kind: 'metamagics', id: 'crb.hum-craft' }]
  ch.build.initiation = 2
  const v = validateSr6(data, cr, ch)
  expect(v.filter(x => x.code === 'magic.metamagicUser').map(x => [x.path, x.message, x.page]))
    .toEqual([['magic.m1', 'Glow Point is for adepts only, not a full magician.', 160]])
  expect(v.find(x => x.code === 'magic.metamagicCount')?.message).toBe('3 metamagics at initiation grade 2: each grade brings one.')
  // an error (owner, 2026-10-09) that a GM's approval clears
  const count = v.find(x => x.code === 'magic.metamagicCount')!
  expect(count.severity).toBe('error')
  const approved = { ...ch, build: { ...ch.build, picks: ch.build.picks.map(p => ({ ...p })) }, overrides: [{ code: count.code, path: count.path, note: 'GM granted' }] }
  expect(validateSr6(data, cr, approved).find(x => x.code === 'magic.metamagicCount')?.approved).toBe(true)
  expect(validateSr6(data, cr, approved).filter(x => x.severity === 'error' && !x.approved).map(x => x.code)).not.toContain('magic.metamagicCount')
  expect(canFinalizeSr6(validateSr6(data, cr, ch))).toBe(false)
  ch.build.initiation = 3
  ch.build.magic = 'mystic-adept'  // takes both
  expect(validateSr6(data, cr, ch).map(x => x.code)).not.toEqual(expect.arrayContaining(['magic.metamagicUser']))
  expect(validateSr6(data, cr, ch).map(x => x.code)).not.toContain('magic.metamagicCount')
})

test('career: a metamagic the runner may not take is recorded, an error a GM may approve; one taken again is a level', () => {
  const { data, cr } = made(), line = (id: string) => ({ op: 'initiate' as const, line: { uid: '', kind: 'metamagics' as const, id } })
  const mage = runner('full', true)
  mage.build.attributes.mag.points = 5
  const rm = record(mage, line('crb.glow-point'), data, cr)
  if (!rm.ok) throw new Error(rm.reason)
  const vm = validateCareer(data, cr, rm.ch).filter(x => x.code === 'magic.metamagicUser')
  expect(vm.map(x => [x.severity, x.page, x.message])).toEqual([['error', 160, 'Glow Point is for adepts only, not a full magician.']])
  expect(validateCareer(data, cr, { ...rm.ch, overrides: [{ code: vm[0].code, path: vm[0].path, note: 'GM ok' }] })
    .find(x => x.code === 'magic.metamagicUser')?.approved).toBe(true)
  expect(preview(mage, line('crb.hum-craft'), data, cr)).toMatchObject({ ok: true })
  const adept = runner('adept', true)
  adept.build.attributes.mag.points = 5
  let ch = adept
  for (let i = 0; i < 2; i++) { const r = record(ch, line('crb.glow-point'), data, cr); if (!r.ok) throw new Error(r.reason); ch = r.ch }
  expect(currentBuild(ch)).toMatchObject({ initiation: 2, picks: [{ id: 'crb.glow-point', level: 2, name: 'Glow Point' }] })
  expect(ch.ledger.at(-1)).toMatchObject({ type: 'advance', label: 'Initiation grade 2 (Glow Point 2)' })
  const known = record(ch, line('crb.soft-echo'), data, cr)
  if (!known.ok) throw new Error(known.reason)
  expect(preview(known.ch, line('crb.soft-echo'), data, cr)).toEqual({ ok: false, reason: 'already-known' })
})

test('a skill bonus adds to that skill’s dice pool only; Social Rating is Charisma plus the worn armor’s Social', () => {
  const { data, cr } = made(), ch = runner('mundane'), b = ch.build
  b.skills = [{ id: 'crb.gab', points: 3, karma: 0 }, { id: 'crb.tinkering', points: 2, karma: 0 }]
  const pool = (id: string) => deriveSr6(data, cr, ch).pools.find(p => p.skill === id)!.dp
  const before = [pool('crb.gab'), pool('crb.tinkering')]
  b.purchases.push({ uid: 'w1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, qty: 1, accessories: [],
    bonuses: [{ target: 'skill', skill: 'crb.gab', value: 1, perRating: true }] })
  expect([pool('crb.gab'), pool('crb.tinkering')]).toEqual([before[0] + 2, before[1]])
  // an accessory's skill bonus is its host's: not the runner's pool, nor the host's own values
  b.purchases[0].accessories.push({ uid: 'w2', kind: 'gear', id: 'crb.zap-scope', qty: 1, accessories: [], bonuses: [{ target: 'skill', skill: 'crb.gab', value: 5 }] })
  expect(pool('crb.gab')).toBe(before[0] + 2)
  expect(deriveSr6(data, cr, ch).hosts).toEqual([])

  const cha = deriveSr6(data, cr, ch).attrs.cha.augmented
  b.purchases.push({ uid: 'a1', kind: 'armor', id: 'crb.padded-vest', qty: 1, accessories: [] })
  expect(deriveSr6(data, cr, ch).socialRating).toBe(cha)  // not worn
  b.purchases.at(-1)!.worn = true
  expect(deriveSr6(data, cr, ch).socialRating).toBe(cha - 1)  // its Social –1
})

test('an armor’s Social as printed: a sign, an en dash for minus, a dash for none', () => {
  expect([armorSocial('+2'), armorSocial('–4'), armorSocial('-1'), armorSocial('—'), armorSocial(undefined), armorSocial('Rating', 3)])
    .toEqual([2, -4, -1, null, null, 3])
  expect(entryValues(made().data.entry('armor', 'crb.padded-vest')!)).toMatchObject({ social: -1, defense: 2 })
})

test('the runner file keeps a skill bonus; one naming no skill is refused', () => {
  const ch = runner('mundane')
  ch.build.purchases.push({ uid: 'w1', kind: 'gear', id: 'crb.zap-scope', qty: 1, accessories: [], bonuses: [{ target: 'skill', skill: 'crb.gab', value: 2 }] })
  const back = xmlToSr6(sr6ToXml(ch))
  expect(back.ok && back.character.build.purchases[0].bonuses).toEqual([{ target: 'skill', skill: 'crb.gab', value: 2 }])
  expect(xmlToSr6(sr6ToXml(ch).replace(' skill="crb.gab"', ''))).toMatchObject({ ok: false, reason: expect.stringMatching(/names no skill/) })
  const { data, cr } = made()
  expect(apply(ch.build, { op: 'bonus', uid: 'w1', bonuses: [{ target: 'skill', value: 1 }] }, data, cr)).toEqual({ ok: false, reason: 'no-skill' })
})

test('the export: Mara’s skill bonus by id and name, her armor’s Social, a spell’s and a metamagic’s flags as printed', () => {
  const w = sampleWorld(), r = exportSr6Runners(w.c, w.data, w.cr, [mara(w)], SAMPLE_OPTS).runners![0]
  expect(r.purchases.find(x => x.uid === 'c1')!.bonuses).toContainEqual({ target: 'skill', id: 'mur.firearms', name: 'Firearms', value: 1 })
  expect(r.derived?.pools.find(p => p.skill === 'mur.firearms')!.dp).toBe(4 + 5 + 1 + 1)  // rank 4, AGI 5, the booster's +1, Lucky Break's catalog AGI +1 (its low-confidence +2 not)
  expect(r.purchases.find(x => x.uid === 'a1')!.values.social).toBe(2)
  expect(r.picks.find(x => x.uid === 'p1')!.attrs.opposed).toBe('true')
  expect(r.picks.find(x => x.uid === 'p5')!.attrs.user).toBe('adept')
})
