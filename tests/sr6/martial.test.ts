// Martial arts (src/sr6/engine/martial.ts; Firing Squad p. 97's rules, the made-up fixture's invented prices: a style 8
// karma, a technique 4): the build's styles and techniques through the editor steps, the karma budget, career spends,
// Review's checks, the runner file and the export. Every style and technique here is invented.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { karmaBudget } from '../../src/sr6/engine/budgets'
import { currentBuild, preview, record, validateCareer } from '../../src/sr6/engine/career'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { exportSr6Runners } from '../../src/sr6/engine/export'
import { prerequisites, signatureOf } from '../../src/sr6/engine/martial'
import { migrateSr6Ids } from '../../src/sr6/engine/migrate'
import { makeProvider } from '../../src/sr6/engine/providers'
import { canFinalizeSr6, validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type Sr6Character } from '../../src/sr6/model/character'
import type { Sr6Entry, Sr6Kind } from '../../src/sr6/model/types'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM } from './fixture'

const NOW = '2026-10-09T10:00:00.000Z'
const en = (kind: Sr6Kind, id: string, name: string, attrs: Record<string, string>, needs: [string, string][] = []): Sr6Entry => ({
  id,
  kind,
  name,
  source: 'CRB',
  page: 198,
  attrs,
  parts: needs.map(([k, text]) => ({ tag: 'requires', attrs: { kind: k }, text })),
  text: '',
})
/** The fixture (Glow Fist: Mobility, Striking, signature Glow Jab) plus made-up techniques of other categories. */
function world() {
  const c = fixtureCatalog()
  for (const e of [
    en('martialtechniques', 'crb.made-up-roll', 'Made-up Roll', { category: 'Mobility' }),
    en('martialtechniques', 'crb.made-up-stare', 'Made-up Stare', { category: 'General' }),
    en('martialtechniques', 'crb.made-up-cut', 'Made-up Cut', { category: 'Weapon; may only be used with made-up blades' }),
    en('martialarts', 'crb.made-up-blade', 'Made-up Blade', { categories: 'Weapon', signature: 'Made-up Cut' }),
    // printed prerequisites (the catalog's <requires kind>): another technique, the fixture's adept power and quality, other
    en('martialtechniques', 'crb.made-up-leap', 'Made-up Leap', { category: 'Mobility' }, [['technique', 'Made-up Roll']]),
    en('martialtechniques', 'crb.made-up-palm', 'Made-up Palm', { category: 'General' }, [
      ['adeptpower', 'Quick Step'],
      ['quality', 'Lucky Streak'],
      ['other', 'a made-up implant'],
    ]),
  ])
    c.entries[e.kind].set(e.id, e)
  return { c, data: sr6Data(c), cr: fixtureCreation() }
}
function draft() {
  const ch = blankSr6('karma', 'm1', NOW)
  ch.build = buildOf('karma', { metatype: GLIM })
  ch.identity.metatype = GLIM
  return ch
}
const must = (r: { ok: boolean; reason?: string }) => {
  if (!r.ok) throw new Error(r.reason)
}
const codes = (w: ReturnType<typeof world>, ch: Sr6Character) => validateSr6(w.data, w.cr, ch).filter(v => v.code.startsWith('martial.'))

test('a style comes with its signature technique; techniques are learned once; removing a style takes its techniques', () => {
  const w = world(),
    ch = draft(),
    b = ch.build
  const sig = signatureOf(b, w.c.entries.martialtechniques.values(), w.c.entries.martialarts.get('crb.glow-fist')!)
  expect(sig?.id).toBe('crb.glow-jab')
  must(apply(b, { op: 'martialart', id: 'crb.glow-fist', signature: sig!.id }, w.data, w.cr))
  expect(b.martialArts).toEqual([
    { uid: expect.any(String), id: 'crb.glow-fist', name: 'Glow Fist', techniques: [{ uid: expect.any(String), id: 'crb.glow-jab', name: 'Glow Jab' }] },
  ])
  const style = b.martialArts[0].uid
  expect(apply(b, { op: 'martialart', id: 'crb.glow-fist' }, w.data, w.cr)).toEqual({ ok: false, reason: 'already-taken' })
  expect(apply(b, { op: 'technique', style, id: 'crb.glow-jab' }, w.data, w.cr)).toEqual({ ok: false, reason: 'already-taken' })
  expect(apply(b, { op: 'technique', style, id: 'crb.nope' }, w.data, w.cr)).toEqual({ ok: false, reason: 'unknown-entry' })
  must(apply(b, { op: 'technique', style, id: 'crb.made-up-roll' }, w.data, w.cr))
  // the signature already learned elsewhere doesn't come again
  must(apply(b, { op: 'martialart', id: 'crb.made-up-blade' }, w.data, w.cr))
  expect(apply(b, { op: 'technique', style: b.martialArts[1].uid, id: 'crb.made-up-roll' }, w.data, w.cr)).toEqual({ ok: false, reason: 'already-taken' })
  must(apply(b, { op: 'technique', style, remove: b.martialArts[0].techniques[1].uid }, w.data, w.cr))
  expect(b.martialArts[0].techniques.map(t => t.id)).toEqual(['crb.glow-jab'])
  must(apply(b, { op: 'martialart', remove: style }, w.data, w.cr))
  expect(b.martialArts.map(m => m.id)).toEqual(['crb.made-up-blade'])
})

test('karma: a style at karmaMartialArt, each technique at karmaTechnique, the style’s signature free', () => {
  const w = world(),
    b = draft().build
  b.martialArts = [
    {
      uid: 's1',
      id: 'crb.glow-fist',
      techniques: [
        { uid: 't1', id: 'crb.glow-jab' },
        { uid: 't2', id: 'crb.made-up-roll' },
      ],
    },
    { uid: 's2', id: 'crb.made-up-blade', techniques: [{ uid: 't3', id: 'crb.made-up-stare' }] },
  ]
  const line = karmaBudget(b, w.data, w.cr, makeProvider('karma', w.data, w.cr)).breakdown!.find(l => l.key === 'martialArts')
  expect(line).toMatchObject({ amount: 8 + 4 + 8 + 4, sign: 'spend', tab: 'martial' })
  w.cr.delete('karmaMartialArt')
  w.cr.delete('karmaTechnique')
  expect(karmaBudget(b, w.data, w.cr, makeProvider('karma', w.data, w.cr)).breakdown!.some(l => l.key === 'martialArts')).toBe(false)
})

test('Review: a style twice, a technique twice, a technique outside the style’s categories, a gone entry, an unset price', () => {
  const w = world(),
    ch = draft()
  ch.build.martialArts = [
    {
      uid: 's1',
      id: 'crb.glow-fist',
      techniques: [
        { uid: 't1', id: 'crb.glow-jab' },
        { uid: 't2', id: 'crb.made-up-stare' },
      ],
    },
    {
      uid: 's2',
      id: 'crb.glow-fist',
      techniques: [
        { uid: 't3', id: 'crb.made-up-stare' },
        { uid: 't4', id: 'crb.made-up-cut' },
      ],
    },
  ]
  const v = codes(w, ch)
  expect(v.map(x => [x.code, x.path, x.source, x.page])).toEqual([
    ['martial.duplicateStyle', 'martial.s2', 'FS', 97],
    ['martial.duplicateTechnique', 'martial.s2', 'FS', 97],
    ['martial.category', 'martial.s2.t4', 'FS', 97],
  ])
  expect(v[2].message).toBe('Made-up Cut is a Weapon technique; Glow Fist teaches Mobility, Striking and General ones.')
  // the blade's own signature (a Weapon technique) fits it; a gone style or technique is catalog.missing, not a category error
  ch.build.martialArts = [
    {
      uid: 's3',
      id: 'crb.made-up-blade',
      techniques: [
        { uid: 't5', id: 'crb.made-up-cut' },
        { uid: 't6', id: 'crb.made-up-stare' },
      ],
    },
    { uid: 's4', id: 'crb.made-up-gone', name: 'Made-up Gone', techniques: [{ uid: 't7', id: 'crb.made-up-vanished', name: 'Made-up Vanished' }] },
  ]
  expect(codes(w, ch)).toEqual([])
  expect(
    validateSr6(w.data, w.cr, ch)
      .filter(x => x.code === 'catalog.missing')
      .map(x => x.message),
  ).toEqual(['Made-up Gone is no longer in the catalog.', 'Made-up Vanished is no longer in the catalog.'])
  w.cr.delete('karmaTechnique')
  expect(
    validateSr6(w.data, w.cr, ch)
      .filter(x => x.code === 'setting.unset')
      .map(x => x.message),
  ).toContain('Martial arts technique (a style’s signature one is free) isn’t set: Table setup → Creation rules.')
})

test('prerequisites: a technique taken without its adept power, technique or quality is an error a GM may approve', () => {
  const w = world(),
    ch = draft(),
    b = ch.build
  // the editor takes it anyway
  b.martialArts = [{ uid: 's1', id: 'crb.glow-fist', techniques: [{ uid: 't1', id: 'crb.glow-jab' }] }]
  must(apply(b, { op: 'technique', style: 's1', id: 'crb.made-up-leap' }, w.data, w.cr))
  b.martialArts[0].techniques[1].uid = 't2'
  b.martialArts[0].techniques.push({ uid: 't3', id: 'crb.made-up-palm' })
  const v = codes(w, ch)
  expect(v.map(x => [x.code, x.severity, x.path, x.source, x.page, x.message])).toEqual([
    ['martial.requires', 'error', 'martial.s1.t2', 'FS', 97, 'Made-up Leap requires the Made-up Roll technique, which the runner doesn’t have.'],
    ['martial.requires', 'error', 'martial.s1.t3', 'FS', 97, 'Made-up Palm requires the Quick Step adept power, which the runner doesn’t have.'],
    ['martial.requires', 'error', 'martial.s1.t3', 'FS', 97, 'Made-up Palm requires the Lucky Streak quality, which the runner doesn’t have.'],
  ])
  expect(canFinalizeSr6(v)).toBe(false)
  // one approval a technique
  ch.overrides = [{ code: 'martial.requires', path: 'martial.s1.t3', note: 'GM ok' }]
  expect(codes(w, ch).map(x => !!x.approved)).toEqual([false, true, true])
  ch.overrides = []
  // learned (under any style), picked and taken: met; other is shown, never checked
  b.martialArts[0].techniques.push({ uid: 't4', id: 'crb.made-up-roll' })
  b.picks.push({ uid: 'p1', kind: 'adeptpowers', id: 'crb.quick-step', level: 1 })
  b.qualities.push({ uid: 'q1', id: 'crb.lucky-streak', level: 1 })
  expect(codes(w, ch)).toEqual([])
  expect(prerequisites(w.data, b, w.data.entry('martialtechniques', 'crb.made-up-palm'))).toEqual([
    { kind: 'adeptpower', name: 'Quick Step', met: true },
    { kind: 'quality', name: 'Lucky Streak', met: true },
    { kind: 'other', name: 'a made-up implant' },
  ])
  // the export's technique carries them; one printing none has no field
  const r = exportSr6Runners(w.c, w.data, w.cr, [ch], { descriptions: false, now: NOW, appVersion: '0' }).runners![0]
  const t = r.martialArts[0].techniques
  expect(t.find(x => x.uid === 't2')!.requires).toEqual([{ kind: 'technique', name: 'Made-up Roll', met: true }])
  expect('requires' in t.find(x => x.uid === 't1')!).toBe(false)
})

/** The fixture with a technique learned near or far (one entry each, the old id an alias of the first: importer
 *  flags.options and moved.py), a style whose signature prints the version in lower case, and techniques needing a
 *  version of it and an augmentation. */
function versions() {
  const tech = (id: string, name: string, inner = '') =>
    `<martialtechnique id="${id}" source="CRB" page="199" category="Mobility"><name>${name}</name>${inner}<text/></martialtechnique>`
  const c = fixtureCatalog((file, xml) =>
    file.endsWith('martialtechniques.xml')
      ? xml.replace(
          '</sr6:data>',
          [
            tech('crb.glow-step-near', 'Glow Step (Near)', '<alias>Glow Step</alias><alias id="crb.glow-step"/>'),
            tech('crb.glow-step-far', 'Glow Step (Far)', '<alias>Glow Step</alias>'),
            tech(
              'crb.glow-drift',
              'Glow Drift',
              '<requires kind="technique">glow step</requires><requires kind="augmentation">at least one full torqlimb</requires>',
            ),
            tech('crb.glow-shell', 'Glow Shell', '<requires kind="augmentation">platings or at least 2.0 Essence in torqlimbs</requires>'),
          ].join('') + '</sr6:data>',
        )
      : file.endsWith('martialarts.xml')
        ? xml.replace(
            '</sr6:data>',
            '<martialart id="crb.glow-kata" source="CRB" page="199" categories="Mobility" signature="Glow Step (near)"><name>Glow Kata</name><text/></martialart></sr6:data>',
          )
        : xml,
  )
  return { c, data: sr6Data(c), cr: fixtureCreation() }
}

test('a technique learned in versions: its old id goes to the first, a signature printing the version finds it', () => {
  const w = versions(),
    ch = draft()
  ch.build.martialArts = [{ uid: 's1', id: 'crb.glow-fist', techniques: [{ uid: 't1', id: 'crb.glow-step', name: 'Glow Step' }] }]
  expect(migrateSr6Ids(ch, w.c).build.martialArts[0].techniques[0].id).toBe('crb.glow-step-near')
  expect(signatureOf(draft().build, w.c.entries.martialtechniques.values(), w.c.entries.martialarts.get('crb.glow-kata')!)?.id).toBe('crb.glow-step-near')
})

test('an augmentation prerequisite: an error (a GM may approve it), met by a line’s name, label or category word', () => {
  const w = versions(),
    ch = draft(),
    b = ch.build
  b.martialArts = [
    {
      uid: 's1',
      id: 'crb.glow-kata',
      techniques: [
        { uid: 't1', id: 'crb.glow-drift' },
        { uid: 't2', id: 'crb.glow-shell' },
      ],
    },
  ]
  const v = codes(w, ch).filter(x => x.code !== 'martial.category')
  expect(v.map(x => [x.code, x.severity, x.path, x.message])).toEqual([
    ['martial.requires', 'error', 'martial.s1.t1', 'Glow Drift requires the glow step technique, which the runner doesn’t have.'],
    ['martial.augmentation', 'error', 'martial.s1.t1', 'Glow Drift requires at least one full torqlimb, which the runner’s augmentations don’t include.'],
  ])
  expect(canFinalizeSr6(v)).toBe(false)
  ch.overrides = [{ code: 'martial.augmentation', path: 'martial.s1.t1', note: 'GM ok' }]
  expect(codes(w, ch).find(x => x.code === 'martial.augmentation')?.approved).toBe(true)
  // either version of the technique; the torqlimb (its label `Torqlimb: Limb (synthetic)`); an amount can't be told
  b.martialArts[0].techniques.push({ uid: 't3', id: 'crb.glow-step-far' })
  b.purchases.push({ uid: 'a1', kind: 'augmentations', id: 'crb.limb-synthetic', qty: 1, accessories: [] })
  expect(codes(w, ch).filter(x => x.code !== 'martial.category')).toEqual([])
  const shell = () => prerequisites(w.data, b, w.data.entry('martialtechniques', 'crb.glow-shell'))
  expect(shell()).toEqual([{ kind: 'augmentation', name: 'platings or at least 2.0 Essence in torqlimbs' }])
  b.purchases[0].accessories.push({ uid: 'a2', kind: 'augmentations', id: 'crb.plating', rating: 1, qty: 1, accessories: [] })
  expect(shell()[0].met).toBe(true)
})

test('career: a style with its signature, a technique, refusals; replayed on the build', () => {
  const w = world(),
    ch = draft()
  ch.finalizedAt = NOW
  ch.ledger = [{ id: 'f1', at: NOW, type: 'finalize', karma: 30, nuyen: 0 }]
  const style = { op: 'martialart' as const, line: { uid: '', id: 'crb.glow-fist', techniques: [{ uid: '', id: 'crb.glow-jab' }] } }
  expect(preview(ch, style, w.data, w.cr)).toEqual({ ok: true, label: 'Martial art: Glow Fist with Glow Jab', karma: 8, nuyen: 0 })
  expect(preview(ch, { op: 'martialart', line: { uid: '', id: 'crb.glow-fist', techniques: [{ uid: '', id: 'crb.made-up-roll' }] } }, w.data, w.cr)).toEqual({
    ok: false,
    reason: 'not-signature',
  })
  const r1 = record(ch, style, w.data, w.cr, undefined, NOW)
  if (!r1.ok) throw new Error(r1.reason)
  const b1 = currentBuild(r1.ch),
    uid = b1.martialArts[0].uid
  expect(b1.martialArts[0]).toMatchObject({ id: 'crb.glow-fist', name: 'Glow Fist', techniques: [{ id: 'crb.glow-jab', name: 'Glow Jab' }] })
  expect(uid).not.toBe('')
  expect(preview(r1.ch, style, w.data, w.cr)).toEqual({ ok: false, reason: 'already-known' })
  const roll = { op: 'technique' as const, target: uid, line: { uid: '', id: 'crb.made-up-roll' } }
  expect(preview(r1.ch, roll, w.data, w.cr)).toEqual({ ok: true, label: 'Technique: Made-up Roll (Glow Fist)', karma: 4, nuyen: 0 })
  // a technique the style doesn't teach is recorded: Review's martial.category, an error a GM may approve
  const cut = record(r1.ch, { ...roll, line: { uid: '', id: 'crb.made-up-cut' } }, w.data, w.cr, undefined, NOW)
  if (!cut.ok) throw new Error(cut.reason)
  const cv = validateCareer(w.data, w.cr, cut.ch).filter(x => x.code === 'martial.category')
  expect(cv.map(x => [x.severity, x.source, x.page])).toEqual([['error', 'FS', 97]])
  expect(
    validateCareer(w.data, w.cr, { ...cut.ch, overrides: [{ code: cv[0].code, path: cv[0].path, note: 'GM ok' }] }).find(x => x.code === 'martial.category')
      ?.approved,
  ).toBe(true)
  expect(preview(r1.ch, { ...roll, line: { uid: '', id: 'crb.glow-jab' } }, w.data, w.cr)).toEqual({ ok: false, reason: 'already-known' })
  expect(preview(r1.ch, { ...roll, target: 'nope' }, w.data, w.cr)).toEqual({ ok: false, reason: 'not-taken' })
  const r2 = record(r1.ch, roll, w.data, w.cr, undefined, NOW)
  if (!r2.ok) throw new Error(r2.reason)
  expect(currentBuild(r2.ch).martialArts[0].techniques.map(t => t.id)).toEqual(['crb.glow-jab', 'crb.made-up-roll'])
  // the ledger's lines survive the file
  const back = xmlToSr6(sr6ToXml(r2.ch))
  expect(back.ok && currentBuild(back.character).martialArts).toEqual(currentBuild(r2.ch).martialArts)
  w.cr.delete('karmaTechnique')
  expect(preview(r2.ch, { ...roll, line: { uid: '', id: 'crb.made-up-stare' } }, w.data, w.cr)).toEqual({ ok: false, reason: 'unset:karmaTechnique' })
})

test('an older runner file without martial arts reads as none', () => {
  const r = xmlToSr6(readFileSync('tests/fixtures/sr6/runner-career.xml', 'utf8'))
  expect(r.ok && r.character.build.martialArts).toEqual([])
})

test('export: each style as an item with its uid and its techniques; a gone one as what the file has', () => {
  const w = world(),
    ch = draft()
  ch.build.martialArts = [
    { uid: 's1', id: 'crb.glow-fist', techniques: [{ uid: 't1', id: 'crb.glow-jab' }] },
    { uid: 's2', id: 'crb.made-up-gone', name: 'Made-up Gone', techniques: [] },
  ]
  const r = exportSr6Runners(w.c, w.data, w.cr, [ch], { descriptions: false, now: NOW, appVersion: '0' }).runners![0]
  expect(r.martialArts[0]).toMatchObject({
    uid: 's1',
    id: 'crb.glow-fist',
    kind: 'martialarts',
    name: 'Glow Fist',
    source: 'CRB',
    page: 198,
    attrs: { categories: 'Mobility, Striking', signature: 'Glow Jab' },
    techniques: [{ uid: 't1', id: 'crb.glow-jab', kind: 'martialtechniques', name: 'Glow Jab', attrs: { category: 'Striking' } }],
  })
  expect(r.martialArts[1]).toEqual({
    uid: 's2',
    id: 'crb.made-up-gone',
    kind: 'martialarts',
    name: 'Made-up Gone',
    canon: false,
    attrs: {},
    parts: [],
    values: {},
    techniques: [],
  })
})
