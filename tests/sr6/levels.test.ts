// One catalog item per level (src/sr6/engine/levels.ts, owner decision 2026-10-11) on the made-up fixture: a rated
// entry and a leveled one expand into their levels with the level's values, rows printed per level group as a family,
// the parent stays reachable by id and name, an edit on it reaches every level, a saved runner's lines move to the
// level's entry, and the career spends move between levels. Invented numbers throughout.
import { expect, test } from 'vitest'
import { apply } from '../../src/sr6/engine/actions'
import { augmentBonus, priced } from '../../src/sr6/engine/budgets'
import { currentBuild, preview, record } from '../../src/sr6/engine/career'
import { sr6Data } from '../../src/sr6/engine/data'
import { effectBonuses } from '../../src/sr6/engine/effects'
import { exportSr6Runner } from '../../src/sr6/engine/export'
import { buildSr6Catalog, resolveEntry } from '../../src/sr6/engine/load'
import { migrateSr6Ids } from '../../src/sr6/engine/migrate'
import { withSampleFixes } from '../../src/sr6/engine/samplefix'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankBuild, blankSr6, type Sr6Advance, type Sr6Character } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM, made } from './fixture'

const FILE = (kind: string, body: string) => `<?xml version="1.0" encoding="UTF-8"?>\n<sr6:data xmlns:sr6="urn:chummer-sr6:data:1" kind="${kind}" version="1">${body}</sr6:data>`
const OPTS = { descriptions: false, now: '2026-10-11T00:00:00.000Z', appVersion: 'test' }

test('a rated entry is one entry per rating, named with it, priced at it; the parent is out of the list but read by id', () => {
  const c = fixtureCatalog(), eyes = [1, 2, 3].map(n => c.entries.augmentations.get(`crb.glow-eyes.${n}`)!)
  expect(eyes.map(e => e.name)).toEqual(['Glow Eyes 1', 'Glow Eyes 2', 'Glow Eyes 3'])
  expect(eyes[1].attrs).toMatchObject({ rating: '2', family: 'crb.glow-eyes', level: '2', cost: 'Rating × 500', category: 'eyeware' })
  expect(eyes[1].aliases).toContain('Glow Eyes')
  expect(c.entries.augmentations.has('crb.glow-eyes')).toBe(false)
  expect(resolveEntry(c, 'augmentations', 'crb.glow-eyes')?.attrs.rating).toBe('1–3')
  expect(c.levels!.get('augmentations/crb.glow-eyes')).toMatchObject({ kind: 'augmentations', family: 'crb.glow-eyes' })
  const data = sr6Data(c), cr = fixtureCreation()
  // the level's entry prices at its rating with no rating on the line; the parent still prices a line naming it
  expect(priced({ uid: 'x', kind: 'augmentations', id: 'crb.glow-eyes.3', qty: 1, accessories: [] }, data, cr)).toMatchObject({ cost: 1500, essence: 0.3 })
  expect(priced({ uid: 'x', kind: 'augmentations', id: 'crb.glow-eyes', rating: 3, qty: 1, accessories: [] }, data, cr)).toMatchObject({ cost: 1500 })
  expect(data.siblings('augmentations', 'crb.glow-eyes.2').map(e => e.id)).toEqual(['crb.glow-eyes.1', 'crb.glow-eyes.2', 'crb.glow-eyes.3'])
  expect(data.atLevel('augmentations', 'crb.glow-eyes', 3)?.id).toBe('crb.glow-eyes.3')
  expect(data.atLevel('augmentations', 'crb.glow-eyes.1', 4)).toBeUndefined()
  expect(data.levelOf(eyes[2])).toBe(3)
  expect(data.sameFamily('augmentations', 'crb.glow-eyes.2', 'crb.glow-eyes')).toBe(true)
  expect(data.sameFamily('augmentations', 'crb.glow-eyes.2', 'crb.spring-tendons')).toBe(false)
})

test('a leveled quality or power is one entry per level with its Karma or power points and per-level effects worked out', () => {
  const c = fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml')
    ? x.replace('<name>Lucky Streak</name>', '<name>Lucky Streak</name><effect target="derived:stun-monitor" op="add" value="R"/><effect target="attr:bod" op="add" value="R*2" switch="activated"/>') : x))
  const q2 = c.entries.qualities.get('crb.lucky-streak.2')!, q3 = c.entries.qualities.get('crb.lucky-streak.3')!
  expect(q2.attrs).toMatchObject({ karma: '8', family: 'crb.lucky-streak', level: '2', kind: 'positive' })
  expect(q2.attrs.perLevel).toBeUndefined()
  expect(q2.attrs.maxLevel).toBeUndefined()
  expect(q3.parts.filter(p => p.tag === 'effect').map(p => p.attrs.value)).toEqual(['3', '6'])
  expect(c.entries.qualities.has('crb.lucky-streak.4')).toBe(false)
  const data = sr6Data(c)
  expect(effectBonuses(data, q2)).toEqual([{ target: 'stun', value: 2 }, { target: 'bod', value: 4, switch: 'activated' }])
  expect(c.entries.adeptpowers.get('crb.quick-step.4')!.attrs).toMatchObject({ cost: '1', level: '4' })
  expect(data.qualities['crb.lucky-streak.2']).toMatchObject({ karma: 8, perLevel: false, maxLevel: 1 })
  expect(data.qualities['crb.lucky-streak']).toMatchObject({ karma: 4, perLevel: true, maxLevel: 3, parent: true })
})

test('a rated bioware with +R on a test (Awareness: Tactical, rating 1–3) is Tactical 1, 2 and 3 with +1, +2 and +3', () => {
  const c = fixtureCatalog((f, x) => (f.endsWith('crb/augmentations.xml')
    ? x.replace('</sr6:data>', '<augmentation id="crb.zap-sense-tactical" source="CRB" page="1" type="bioware" category="made-up bioware" rating="1–3" essence="Rating × 0.2" avail="2" cost="Rating × 15000">'
      + '<name>Zap Sense: Tactical</name><effect target="derived:defense" op="add" value="R"/><effect target="test:surprise" op="add" value="R"/><text/></augmentation></sr6:data>') : x))
  const levels = [1, 2, 3].map(n => c.entries.augmentations.get(`crb.zap-sense-tactical.${n}`)!)
  expect(levels.map(e => e.name)).toEqual(['Zap Sense: Tactical 1', 'Zap Sense: Tactical 2', 'Zap Sense: Tactical 3'])
  expect(c.entries.augmentations.has('crb.zap-sense-tactical')).toBe(false)
  const data = sr6Data(c)
  // each level's +R counts at its rating: Tactical 1, 2, 3 give +1, +2, +3 (a line holding the level has no rating of its own)
  expect(levels.map(e => augmentBonus({ ...blankBuild('priority'), purchases: [{ uid: 'x', kind: 'augmentations', id: e.id, qty: 1, accessories: [] }] }, data, 'defense'))).toEqual([1, 2, 3])
  expect(levels.map(e => priced({ uid: 'x', kind: 'augmentations', id: e.id, qty: 1, accessories: [] }, data, fixtureCreation()).cost)).toEqual([15000, 30000, 45000])
})

test('a leveled entry whose name prints its range has that many levels; one with no printed maximum stays as it is', () => {
  const c = fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml')
    ? x.replace('perLevel="true" maxLevel="3"><name>Lucky Streak</name>', 'perLevel="true"><name>Lucky Streak (1-2)</name>')
      .replace('<name>Knack</name>', '<name>Knack</name>').replace('karma="13"><name>Knack', 'karma="13" perLevel="true"><name>Knack') : x))
  expect([...c.entries.qualities.keys()].filter(k => k.startsWith('crb.lucky-streak'))).toEqual(['crb.lucky-streak.1', 'crb.lucky-streak.2'])
  expect(c.entries.qualities.get('crb.lucky-streak.2')!.name).toBe('Lucky Streak 2')
  expect(c.entries.qualities.get('crb.knack')!.attrs.perLevel).toBe('true')  // (open-ended: its level stays on the line)
  expect(c.levels!.has('qualities/crb.knack')).toBe(false)
})

test('rows the book prints one per level are a family without duplication; a model number is no level', () => {
  const rows = (ns: string[], r: boolean) => ns.map((n, i) => `<augmentation id="crb.row-${i}" source="CRB" page="1" type="cyberware" category="Bodyware" cost="${(i + 1) * 100}"><name>${n}</name>${r ? '<effect target="attr:rea" op="add" value="R"/>' : ''}<text/></augmentation>`).join('')
  const c = fixtureCatalog(undefined, [
    { file: 'custom/sr6/imported/crb/augmentations2.xml', xml: FILE('augmentations', rows(['Zap Reflexes 1', 'Zap Reflexes 2', 'Zap Reflexes 3'], true)) },
    { file: 'custom/sr6/imported/crb/augmentations3.xml', xml: FILE('augmentations', rows(['Zap Jack (Rating 1)', 'Zap Jack (Rating 2)'], false).replace(/crb\.row-/g, 'crb.jack-')) },
    { file: 'custom/sr6/imported/crb/weapons2.xml', xml: FILE('weapons', ['Zap Pistol 70', 'Zap Pistol 75'].map((n, i) => `<weapon id="crb.pistol-${i}" source="CRB" page="1" category="Pistols" dv="2P" cost="100"><name>${n}</name><text/></weapon>`).join('')) }])
  const fam = c.levels!.get('augmentations/crb.zap-reflexes')!
  expect(fam.parent).toBeUndefined()
  expect([...fam.levels]).toEqual([[1, 'crb.row-0'], [2, 'crb.row-1'], [3, 'crb.row-2']])
  // (a row's `R` is its own level: the third row reads at rating 3)
  expect(c.entries.augmentations.get('crb.row-2')!.attrs).toMatchObject({ family: 'crb.zap-reflexes', level: '3', rating: '3' })
  expect(c.entries.augmentations.get('crb.jack-1')!.attrs).toMatchObject({ family: 'crb.zap-jack', level: '2' })
  expect(c.entries.augmentations.get('crb.jack-1')!.attrs.rating).toBeUndefined()
  expect(c.entries.weapons.get('crb.pistol-0')!.attrs.family).toBeUndefined()
  expect(c.levels!.has('weapons/crb.zap-pistol')).toBe(false)
  const data = sr6Data(c)
  expect(data.siblings('augmentations', 'crb.row-0').map(e => e.name)).toEqual(['Zap Reflexes 1', 'Zap Reflexes 2', 'Zap Reflexes 3'])
})

test('an edit on the rated entry reaches every level; an edit keyed by a level is that level', () => {
  const edits = '<augmentation id="crb.glow-eyes" source="CRB" page="283" type="cyberware" category="eyeware" rating="1–3" essence="Rating × 0.2" avail="3" cost="Rating × 500" by="eve"><name>Glow Eyes</name><text/></augmentation>'
    + '<augmentation id="crb.glow-eyes.3" source="CRB" page="283" type="cyberware" category="eyeware" rating="3" essence="0.9" avail="3" cost="9000" by="eve"><name>Glow Eyes 3 (deluxe)</name><text/></augmentation>'
  const c = fixtureCatalog((f, x) => (f.endsWith('edits/edits.xml') ? x.replace('</sr6:data>', edits + '</sr6:data>') : x))
  const data = sr6Data(c), cr = fixtureCreation()
  expect(priced({ uid: 'x', kind: 'augmentations', id: 'crb.glow-eyes.2', qty: 1, accessories: [] }, data, cr)).toMatchObject({ essence: 0.4 })
  expect(c.entries.augmentations.get('crb.glow-eyes.2')!.edited).toBe(true)
  const three = c.entries.augmentations.get('crb.glow-eyes.3')!
  expect(three).toMatchObject({ name: 'Glow Eyes 3 (deluxe)', edited: true, attrs: { cost: '9000', family: 'crb.glow-eyes', level: '3' } })
  expect(three.text).toBe(resolveEntry(c, 'augmentations', 'crb.glow-eyes')!.text)
})

test('the parent’s name answers its lowest level; a link naming a level gets that level; a trait with a level is that level’s quality', () => {
  const { data } = made({ data: d => { d.entry('qualities', 'crb.knack')!.parts.push({ tag: 'link', attrs: { rel: 'grants', name: 'Lucky Streak', kind: 'qualities', level: '2' }, text: '' }) } })
  expect(data.named?.('Lucky Streak', 'qualities')?.id).toBe('crb.lucky-streak.1')
  expect(data.named?.('Lucky Streak 3', 'qualities')?.id).toBe('crb.lucky-streak.3')
  const c = fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('<name>Lucky Streak</name>', '<name>Lucky Streak</name><effect target="derived:overflow" op="add" value="R"/>') : x))
  const d = sr6Data(c)
  d.entry('qualities', 'crb.knack')!.parts.push({ tag: 'link', attrs: { rel: 'grants', name: 'Lucky Streak', kind: 'qualities', level: '2' }, text: '' })
  expect(effectBonuses(d, d.entry('qualities', 'crb.knack'))).toEqual([{ target: 'overflow', value: 2 }])
})

test('a saved runner’s lines naming the parent move to the level’s entry once: purchases at their rating, qualities and picks at their level', () => {
  const c = fixtureCatalog(), at = '2026-10-11T01:00:00.000Z'
  const old: Sr6Character = { ...blankSr6('priority', 'r1', at), build: { ...blankBuild('priority'),
    purchases: [{ uid: 'g1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, qty: 1, grade: 'alpha', accessories: [] },
      { uid: 'g2', kind: 'gear', id: 'crb.tangle-rope', qty: 1, accessories: [] }, { uid: 'g3', kind: 'augmentations', id: 'crb.glow-eyes.3', qty: 1, accessories: [] }],
    qualities: [{ uid: 'q1', id: 'crb.lucky-streak', level: 3 }, { uid: 'q2', id: 'crb.knack', level: 1 }],
    picks: [{ uid: 'p1', kind: 'adeptpowers', id: 'crb.quick-step', level: 2 }, { uid: 'p2', kind: 'metamagics', id: 'crb.glow-point', level: 9 }] } }
  const ch = migrateSr6Ids(old, c, at)
  expect(ch.build.purchases.map(p => [p.id, p.rating, p.grade])).toEqual([['crb.glow-eyes.2', undefined, 'alpha'], ['crb.tangle-rope.1', undefined, undefined], ['crb.glow-eyes.3', undefined, undefined]])
  expect(ch.build.qualities).toEqual([{ uid: 'q1', id: 'crb.lucky-streak.3', level: 1 }, { uid: 'q2', id: 'crb.knack', level: 1 }])
  expect(ch.build.picks).toEqual([{ uid: 'p1', kind: 'adeptpowers', id: 'crb.quick-step.2' }, { uid: 'p2', kind: 'metamagics', id: 'crb.glow-point', level: 9 }])  // (a level it lacks: left as it is)
  expect(ch.migrated?.map(m => `${m.from} → ${m.to}`)).toEqual(['augmentations/crb.glow-eyes → augmentations/crb.glow-eyes.2', 'gear/crb.tangle-rope → gear/crb.tangle-rope.1',
    'adeptpowers/crb.quick-step → adeptpowers/crb.quick-step.2', 'qualities/crb.lucky-streak → qualities/crb.lucky-streak.3'])
  expect(migrateSr6Ids(ch, c)).toBe(ch)
  // before the move, the lines still read: the parent prices at the rating, the quality at its level
  const data = sr6Data(c), cr = fixtureCreation()
  expect(priced(old.build.purchases[0], data, cr).cost).toBe(1500)
  expect(validateSr6(data, cr, old).some(v => v.code === 'catalog.missing')).toBe(false)
})

test('the editor: a level select moves a line, a quality’s and a power’s stepper move to the sibling level', () => {
  const { data, cr } = made(), b = buildOf('priority', { letters: 'CABDA', metatype: GLIM, magic: 'adept' })
  expect(apply(b, { op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes.1', grade: 'alpha' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'rate', uid: b.purchases[0].uid, rating: 3 }, data, cr)).toEqual({ ok: true })
  expect(b.purchases[0]).toMatchObject({ id: 'crb.glow-eyes.3', name: 'Glow Eyes 3', grade: 'alpha' })
  expect(apply(b, { op: 'rate', uid: b.purchases[0].uid, rating: 4 }, data, cr)).toEqual({ ok: false, reason: 'rating-range' })
  expect(apply(b, { op: 'purchase', kind: 'weapons', id: 'crb.zap-gun' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'accessory', host: b.purchases[1].uid, kind: 'gear', id: 'crb.glow-sight', rating: 2 }, data, cr)).toEqual({ ok: true })
  expect(b.purchases[1].accessories[0]).toMatchObject({ id: 'crb.glow-sight.2' })
  expect(apply(b, { op: 'quality', id: 'crb.lucky-streak.2' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'quality', id: 'crb.lucky-streak.1' }, data, cr)).toEqual({ ok: true })  // (another level of one taken: the line moves)
  expect(b.qualities).toHaveLength(1)
  expect(b.qualities[0].id).toBe('crb.lucky-streak.1')
  expect(apply(b, { op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step.3' }, data, cr)).toEqual({ ok: true })
  expect(apply(b, { op: 'powerLevel', uid: b.picks[0].uid, level: 2 }, data, cr)).toEqual({ ok: true })
  expect(b.picks[0]).toMatchObject({ id: 'crb.quick-step.2' })
})

test('career: a quality’s or power’s higher level replaces the lower at the difference; an upgrade replaces gear at the new level’s price', () => {
  const { data, cr } = made(), b = buildOf('karma', { metatype: GLIM, magic: 'adept' })
  b.attributes.mag.karma = 5
  b.qualities.push({ uid: 'q1', id: 'crb.lucky-streak.1', level: 1 })
  b.picks.push({ uid: 'p1', kind: 'adeptpowers', id: 'crb.quick-step.1' })
  b.purchases.push({ uid: 'g1', kind: 'gear', id: 'crb.tangle-rope.1', qty: 1, accessories: [{ uid: 'a1', kind: 'gear', id: 'crb.zap-scope', qty: 1, accessories: [] }] })
  const ch: Sr6Character = { ...blankSr6('karma', 'r2'), build: b, finalizedAt: '2026-10-11T00:00:00.000Z', final: { karma: 40, nuyen: 5000 },
    ledger: [{ id: 'f', at: '2026-10-11T00:00:00.000Z', type: 'finalize', karma: 40, nuyen: 5000 }] }
  const up = (a: Sr6Advance) => { const r = record(ch, a, data, cr); if (!r.ok) throw new Error(r.reason); return r.ch }
  // the quality: 4 Karma a level × the fixture's advance.qualityFactor 3, the difference between level 3 (12) and level 1 (4)
  expect(preview(ch, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak.3', level: 1 } }, data, cr)).toEqual({ ok: true, label: 'Quality: Lucky Streak 3', karma: 24, nuyen: 0 })
  expect(preview(ch, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak', level: 1 } }, data, cr)).toMatchObject({ ok: true, label: 'Quality: Lucky Streak 2', karma: 12 })
  expect(preview(ch, { op: 'quality', line: { uid: '', id: 'crb.lucky-streak.1', level: 1 } }, data, cr)).toEqual({ ok: false, reason: 'already-known' })
  const q = up({ op: 'quality', line: { uid: '', id: 'crb.lucky-streak.3', level: 1 } })
  expect(currentBuild(q).qualities).toEqual([{ uid: 'q1', id: 'crb.lucky-streak.3', level: 1, name: 'Lucky Streak 3' }])
  expect(q.ledger.at(-1)).toMatchObject({ advance: { op: 'quality', target: 'q1' }, karma: 24 })
  // the power: the next level for the difference in power points
  expect(preview(ch, { op: 'pick', line: { uid: '', kind: 'adeptpowers', id: 'crb.quick-step' } }, data, cr)).toEqual({ ok: true, label: 'Adept power: Quick Step 2', karma: 0, nuyen: 0 })
  const p = up({ op: 'pick', line: { uid: '', kind: 'adeptpowers', id: 'crb.quick-step.4' } })
  expect(currentBuild(p).picks).toEqual([{ uid: 'p1', kind: 'adeptpowers', id: 'crb.quick-step.4', name: 'Quick Step 4' }])
  // gear: the new level's full price, the line's uid and accessories kept
  const upgrade: Sr6Advance = { op: 'upgrade', target: 'g1', line: { uid: '', kind: 'gear', id: 'crb.tangle-rope.3', qty: 1, accessories: [] } }
  expect(preview(ch, upgrade, data, cr)).toEqual({ ok: true, label: 'Upgrade: Tangle Rope 1 → Tangle Rope 3', karma: 0, nuyen: 150 })
  expect(preview(ch, { ...upgrade, line: { ...upgrade.line, id: 'crb.zap-pellets' } }, data, cr)).toEqual({ ok: false, reason: 'not-a-level' })
  expect(preview(ch, { ...upgrade, line: { ...upgrade.line, id: 'crb.tangle-rope.1' } }, data, cr)).toEqual({ ok: false, reason: 'already-known' })
  const g = up(upgrade)
  expect(currentBuild(g).purchases[0]).toMatchObject({ uid: 'g1', id: 'crb.tangle-rope.3', name: 'Tangle Rope 3', accessories: [{ uid: 'a1', id: 'crb.zap-scope' }] })
  expect(g.ledger.at(-1)).toMatchObject({ label: 'Upgrade: Tangle Rope 1 → Tangle Rope 3', nuyen: 150 })
})

test('a sample correction naming the printed id fixes a line holding one of its levels; the export writes the level’s entry', () => {
  const c = fixtureCatalog(), data = sr6Data(c), cr = fixtureCreation()
  const ch: Sr6Character = { ...blankSr6('priority', 'r3'), sampleKey: 'CRB|crb.tester', build: { ...blankBuild('priority'), metatype: GLIM,
    purchases: [{ uid: 'g1', kind: 'augmentations', id: 'crb.glow-eyes.3', qty: 1, accessories: [] }, { uid: 'g2', kind: 'gear', id: 'crb.tangle-rope', rating: 2, qty: 1, accessories: [] }],
    qualities: [{ uid: 'q1', id: 'crb.lucky-streak', level: 2 }] } }
  const fixes = { ...c, sampleFixes: new Map([['crb.tester', { id: 'crb.tester', source: 'CRB', page: 9, name: 'Tester', text: '',
    corrects: [{ item: 'crb.glow-eyes', field: 'rating' as const, from: '3', to: '2' }] }]]) }
  const fixed = withSampleFixes(fixes, ch)
  expect(fixed.ch.build.purchases[0]).toMatchObject({ id: 'crb.glow-eyes.2', name: 'Glow Eyes 2' })
  expect(fixed.corrections).toMatchObject([{ item: 'crb.glow-eyes', from: '3', to: '2' }])
  const r = exportSr6Runner(c, data, cr, ch, OPTS)
  expect(r.purchases.map(p => [p.id, p.values.rating, p.values.cost])).toEqual([['crb.glow-eyes.3', 3, 1500], ['crb.tangle-rope.2', 2, 100]])
  expect(r.qualities[0]).toMatchObject({ id: 'crb.lucky-streak.2', name: 'Lucky Streak 2', attrs: { family: 'crb.lucky-streak', level: '2', karma: '8' } })
})

test('a leveled quality’s R-1 and R[..] effects are worked out per level: Lucky Streak 1–3 gives 0, 1, 2 and 1, 2, 5', () => {
  const at = (v: string) => {
    const c = fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml')
      ? x.replace('<name>Lucky Streak</name>', `<name>Lucky Streak</name><effect target="attr:bod" op="add" value="${v}"/>`) : x))
    const data = sr6Data(c)
    return [1, 2, 3].map(n => { const b = blankBuild(); b.metatype = GLIM; b.qualities = [{ uid: 'q', id: `crb.lucky-streak.${n}`, level: 1 }]; return augmentBonus(b, data, 'bod') })
  }
  expect(at('R-1')).toEqual([0, 1, 2])
  expect(at('R[1,2,5]')).toEqual([1, 2, 5])
  expect(at('R')).toEqual([1, 2, 3])
})

test('a rating the family doesn’t have stays on the line naming the parent, so Review still flags it', () => {
  const c = fixtureCatalog(), data = sr6Data(c), cr = fixtureCreation()
  const old: Sr6Character = { ...blankSr6('priority', 'r1'), build: { ...blankBuild('priority'),
    purchases: [{ uid: 'g1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 7, qty: 1, accessories: [] }] } }
  const ch = migrateSr6Ids(old, c)
  expect(ch.build.purchases[0]).toMatchObject({ id: 'crb.glow-eyes', rating: 7 })
  expect(validateSr6(data, cr, ch).map(v => v.code)).toContain('gear.ratingRange')
})

test('career level-ups saved before levels were entries reach the right level; a lifestyle and an upgrade in the ledger get their new ids', () => {
  const c = fixtureCatalog((f, x) => (f.endsWith('crb/lifestyles.xml')
    ? x.replace('id="crb.cozy"', 'id="crb.cozy-new"').replace('<name>Cozy</name>', '<name>Cozy</name><alias id="crb.cozy"/>') : x))
  const b = blankBuild(); b.metatype = GLIM; b.magic = 'adept'
  b.picks = [{ uid: 'p1', kind: 'adeptpowers', id: 'crb.quick-step', level: 2 }]
  b.qualities = [{ uid: 'q1', id: 'crb.lucky-streak', level: 1 }]
  b.sins = [{ uid: 's1', name: 'A', kind: 'real', licences: [], lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 1 }] }]
  b.purchases = [{ uid: 'g1', kind: 'augmentations', id: 'crb.glow-eyes.1', qty: 1, accessories: [] }]
  const adv = (id: string, advance: Sr6Advance) => ({ id, at: '', type: 'advance' as const, advance, label: '', karma: 0, nuyen: 0 })
  const ch: Sr6Character = { ...blankSr6('priority', 'r1', '2026-01-01T00:00:00Z'), build: b, finalizedAt: '2026-01-01', ledger: [
    { id: 'f', at: '', type: 'finalize', karma: 50, nuyen: 9000 },
    adv('a1', { op: 'pick', line: { uid: 'p2', kind: 'adeptpowers', id: 'crb.quick-step', level: 1 } }),
    adv('a2', { op: 'quality', line: { uid: 'q2', id: 'crb.lucky-streak', level: 1 } }),
    adv('a3', { op: 'lifestyle', id: 'crb.cozy', months: 2, sin: 's1', uid: 'l9' }),
    adv('a4', { op: 'upgrade', target: 'g1', line: { uid: 'g1', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, qty: 1, accessories: [] } })] }
  const before = currentBuild(ch), after = currentBuild(migrateSr6Ids(ch, c))
  expect([before.picks.map(p => p.level), before.qualities.map(q => q.level)]).toEqual([[3], [2]])
  expect(after.picks.map(p => [p.uid, p.id])).toEqual([['p1', 'crb.quick-step.3']])
  expect(after.qualities.map(q => [q.uid, q.id, q.level])).toEqual([['q1', 'crb.lucky-streak.2', 1]])
  expect(after.sins[0].lifestyles!.map(l => [l.id, l.months])).toEqual([['crb.cozy-new', 3]])
  expect(after.purchases.map(p => [p.uid, p.id])).toEqual([['g1', 'crb.glow-eyes.2']])
})
