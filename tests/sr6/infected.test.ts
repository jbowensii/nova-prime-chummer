// The Sixth World Companion's Infected player characters (an optional rule, p. 104) and the Awakened flag, on the made-up
// fixture: an entry whose class starts with INFECTED is hidden and refused while infectedAllowed is off (the default);
// an Infected type (<infected>) is the runner's one type, its maxima, free points, Essence, Magic and optional powers read
// from it; the Awakened flag is derived from the magic kind (a technomancer is not Awakened) with a player override (a
// Review warning); <karmaif> prices a quality by it. Invented names, metatypes and prices.
import { expect, test } from 'vitest'
import { apply, reconcile, setPriority } from '../../src/sr6/engine/actions'
import { allBudgets, attrMax, attrRating, magicCap, qualityKarma } from '../../src/sr6/engine/budgets'
import { preview } from '../../src/sr6/engine/career'
import { infectedOff } from '../../src/sr6/engine/critterware'
import { flag, num } from '../../src/sr6/engine/creation'
import { sr6Data } from '../../src/sr6/engine/data'
import { deriveSr6 } from '../../src/sr6/engine/derive'
import { maxEffects } from '../../src/sr6/engine/effects'
import { awakenedFlag, infectedTypes, runnerInfected } from '../../src/sr6/engine/infected'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, MAGIC_KIND_LABELS, type MagicKind, type Sr6Build } from '../../src/sr6/model/character'
import { buildOf, fixtureCatalog, fixtureCreation, GLIM, STONE } from './fixture'

const GHOUL = (base: string, str: number) =>
  `<quality id="crb.zap-ghoul-${base.toLowerCase()}" source="CRB" page="70" kind="positive" karma="20" class="INFECTED"><name>Zap Ghoul (${base})</name>` +
  `<infected strain="III" base="${base}" freePhysical="2" freeMental="2" essence="4" magic="1" magicLoss="1" magicMax="5+initiate-grade"/>` +
  `<effect target="attr-max:str" op="set" value="${str}" when="${base}"/><effect target="attr-max:bod" op="set" value="6" when="${base}"/><text/></quality>`
const MORE = [
  GHOUL('Glimmerkin', 3),
  GHOUL('Stonefolk', 10),
  // Strain Ia (read as I), Awakens as an adept; 30 Karma, 20 if already Awakened
  '<quality id="crb.zap-lurker" source="CRB" page="71" kind="positive" karma="30" class="INFECTED"><name>Zap Lurker</name>' +
    '<infected strain="I" printed="Ia" base="Glimmerkin" awakens="adept" freePhysical="2" freeMental="2" magicMax="ess+initiate-grade"/>' +
    '<optionalpower ref="crb.zap-power.glow" free="true"/><optionalpower ref="crb.zap-power.bite"/>' +
    '<karmaif flag="awakened" value="20" note="less 10 if the character is already Awakened"/><text/></quality>',
  // its base Glimmerkin; any other metatype through the sidebar's terms
  '<quality id="crb.zap-vampire" source="CRB" page="72" kind="positive" karma="27" class="INFECTED"><name>Zap Vampire</name>' +
    '<infected strain="I" base="Glimmerkin" awakens="magician" freePhysical="2" freeMental="2" magicMax="ess+initiate-grade"/>' +
    '<infectedalt base="other" karma="32" bod="1" cha="2" note="32 Karma for a non-glimmerkin vampire"/>' +
    '<effect target="attr-max:bod" op="set" value="7" when="Glimmerkin"/><text/></quality>',
  '<quality id="crb.zap-power.glow" source="CRB" page="70" kind="positive" karma="6" category="Zap Optional Powers" class="INFECTED/OPTIONAL_POWER"><name>Glow</name><text/></quality>',
  '<quality id="crb.zap-power.bite" source="CRB" page="70" kind="positive" karma="8" category="Zap Optional Powers" class="INFECTED/OPTIONAL_POWER"><name>Bite</name><text/></quality>',
  '<quality id="crb.zap-power.shell" source="CRB" page="70" kind="positive" karma="4" category="Zap Optional Powers" class="INFECTED/OPTIONAL_POWER"><name>Shell</name><text/></quality>',
  // an Astral Hazing: 8 Karma, 15 for an Awakened runner
  '<quality id="crb.zap-hazing" source="CRB" page="73" kind="negative" karma="8"><name>Zap Hazing</name><karmaif flag="awakened" value="15" note="15 if the character is Awakened"/><text/></quality>',
].join('\n')
const data = sr6Data(fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('</sr6:data>', `${MORE}\n</sr6:data>`) : x)))
const rules = (on?: boolean, atCreation?: boolean) => {
  const cr = fixtureCreation()
  if (on !== undefined) cr.set('infectedAllowed', { key: 'infectedAllowed', value: on })
  if (atCreation) cr.set('infectedPowersAtCreation', { key: 'infectedPowersAtCreation', value: true })
  return cr
}
const career = (b = buildOf('karma', { metatype: GLIM })) => {
  const ch = blankSr6('karma', 'i1', '2026-10-16T00:00:00Z')
  ch.build = b
  ch.finalizedAt = '2026-10-16T00:00:00Z'
  ch.final = { karma: 100, nuyen: 0 }
  ch.ledger = [{ id: 'f1', at: ch.finalizedAt, type: 'finalize', karma: 100, nuyen: 0 }]
  return ch
}
const q = (id: string) => ({ op: 'quality' as const, line: { uid: '', id, level: 1 } })
const runner = (b: Sr6Build) => ({ ...blankSr6('karma', 'r1', '2026-10-16T00:00:00Z'), build: b })
const codes = (b: Sr6Build, cr = rules(true)) => validateSr6(data, cr, runner(b)).map(v => v.code)
const ON = rules(true)
const infected = (id: string, o: { metatype?: string; magic?: MagicKind } = {}) => {
  const b = buildOf('karma', { metatype: GLIM, ...o })
  expect(apply(b, { op: 'infected', id }, data, ON)).toEqual({ ok: true })
  return b
}

test('off by default: the Infected entries are hidden, and refused at creation and after; another quality is not', () => {
  const cr = rules()
  expect(flag(cr, 'infectedAllowed')).toBeUndefined()
  for (const id of ['crb.zap-lurker', 'crb.zap-power.glow']) {
    expect(infectedOff(data.entry('qualities', id), cr), id).toBe(true)
    expect(apply(buildOf('karma', { metatype: GLIM }), { op: 'quality', id }, data, cr), id).toEqual({ ok: false, reason: 'rule-off' })
    expect(preview(career(), q(id), data, cr), id).toEqual({ ok: false, reason: 'optional-rule-off' })
  }
  expect(apply(buildOf('karma', { metatype: GLIM }), { op: 'infected', id: 'crb.zap-lurker' }, data, cr)).toEqual({ ok: false, reason: 'rule-off' })
  expect(infectedOff(data.entry('qualities', 'crb.butterfingers'), cr)).toBe(false)
})

test('a runner keeps an Infected type it has when the rule goes off: Review warns (never blocks)', () => {
  const b = infected('crb.zap-ghoul-glimmerkin')
  expect(apply(b, { op: 'quality', id: 'crb.zap-ghoul-glimmerkin', uid: b.qualities[0].uid, note: 'strain III' }, data, rules())).toEqual({ ok: true })
  const off = validateSr6(data, rules(), runner(b)).filter(v => v.code === 'infected.off')
  expect(off).toHaveLength(1)
  expect(off[0].severity).toBe('warning')
  expect(codes(b)).not.toContain('infected.off')
})

test('Awakened: magicians, aspected, mystic adepts and adepts; a technomancer is Emerged, not Awakened; the derived values carry it', () => {
  const want: Record<MagicKind, boolean> = { full: true, aspected: true, 'mystic-adept': true, adept: true, technomancer: false, mundane: false }
  for (const [k, v] of Object.entries(want) as [MagicKind, boolean][]) {
    const b = buildOf('karma', { metatype: GLIM, magic: k })
    expect(awakenedFlag(b, data), k).toMatchObject({ value: v, derived: v })
    expect(deriveSr6(data, ON, runner(b)).awakened, k).toBe(v)
  }
  expect(awakenedFlag(buildOf('karma', { magic: 'technomancer' }), data).why).toBe('technomancer: Emerged, not Awakened')
  expect(awakenedFlag(buildOf('karma', { magic: 'adept' }), data).why).toBe(MAGIC_KIND_LABELS.adept.toLowerCase())
  // every Infected is Awakened (p. 105), a Ghoul with no magic kind too
  expect(awakenedFlag(infected('crb.zap-ghoul-glimmerkin'), data)).toMatchObject({ value: true, derived: true, why: 'Infected: Zap Ghoul (Glimmerkin)' })
})

test('the player overrides the flag: shown with what it overrides, a Review warning; null derives it again', () => {
  const b = buildOf('karma', { metatype: GLIM, magic: 'technomancer' })
  expect(apply(b, { op: 'awakened', value: true }, data, ON)).toEqual({ ok: true })
  expect(b.awakened).toBe(true)
  expect(deriveSr6(data, ON, runner(b)).awakened).toBe(true)
  const w = validateSr6(data, ON, runner(b)).filter(v => v.code === 'awakened.override')
  expect(w).toEqual([
    expect.objectContaining({ severity: 'warning', message: 'Derived: not Awakened (technomancer: Emerged, not Awakened); overridden to Awakened.' }),
  ])
  // the same as derived: nothing overridden
  apply(b, { op: 'awakened', value: false }, data, ON)
  expect(codes(b)).not.toContain('awakened.override')
  apply(b, { op: 'awakened', value: null }, data, ON)
  expect(b).not.toHaveProperty('awakened')
})

test('karmaif: a quality costs its Awakened price while the runner is Awakened, at creation and after, and its override', () => {
  const take = (magic: MagicKind) => {
    const b = buildOf('karma', { metatype: GLIM, magic })
    apply(b, { op: 'quality', id: 'crb.zap-hazing' }, data, ON)
    return qualityKarma(b, data, ON).neg
  }
  expect([take('mundane'), take('technomancer'), take('adept')]).toEqual([8, 8, 15])
  expect(data.qualities['crb.zap-hazing'].karmaIf).toEqual({ value: 15, note: '15 if the character is Awakened' })
  // the Infected type's own: Awakened before it (Lurker Awakens a mundane as an adept, at the full price)
  expect(qualityKarma(infected('crb.zap-lurker'), data, ON).pos).toBe(30)
  expect(qualityKarma(infected('crb.zap-lurker', { magic: 'full' }), data, ON).pos).toBe(20)
  const over = infected('crb.zap-lurker')
  apply(over, { op: 'awakened', value: true }, data, ON)
  expect(qualityKarma(over, data, ON).pos).toBe(20)
  // after creation, the same prices (an Infected quality's own Karma, never doubled)
  expect(preview(career(), q('crb.zap-lurker'), data, ON)).toMatchObject({ ok: true, karma: 30 })
  expect(preview(career(buildOf('karma', { metatype: GLIM, magic: 'adept' })), q('crb.zap-lurker'), data, ON)).toMatchObject({ ok: true, karma: 20 })
})

test('the selector lists the types of the runner’s metatype; a Ghoul per base; the non-human vampire through its sidebar', () => {
  const names = (m: string) => infectedTypes(data, m).map(t => `${t.name}:${t.fit}`)
  expect(names(GLIM)).toEqual(['Zap Ghoul (Glimmerkin):own', 'Zap Lurker:own', 'Zap Vampire:own'])
  expect(names(STONE)).toEqual(['Zap Ghoul (Stonefolk):own', 'Zap Vampire:alt'])
  expect(apply(buildOf('karma', { metatype: STONE }), { op: 'infected', id: 'crb.zap-lurker' }, data, ON)).toEqual({ ok: false, reason: 'not-for-metatype' })
  // its maxima replace the metatype's (its `when` the runner's metatype), the other Ghoul's never
  const g = infected('crb.zap-ghoul-glimmerkin')
  expect([attrMax(data, ON, g, 'str'), attrMax(data, ON, g, 'bod'), attrMax(data, ON, g, 'agi')]).toEqual([3, 6, 7])
  const s = buildOf('karma', { metatype: STONE })
  apply(s, { op: 'infected', id: 'crb.zap-ghoul-stonefolk' }, data, ON)
  expect(attrMax(data, ON, s, 'str')).toBe(10)
  // a Stonefolk vampire: its own maxima plus the sidebar's (bod 9+1, cha 3+2), not the Glimmerkin row; 32 Karma
  const v = buildOf('karma', { metatype: STONE })
  apply(v, { op: 'infected', id: 'crb.zap-vampire' }, data, ON)
  expect([attrMax(data, ON, v, 'bod'), attrMax(data, ON, v, 'cha'), attrMax(data, ON, v, 'str')]).toEqual([10, 5, 9])
  expect(qualityKarma(v, data, ON).pos).toBe(32)
  expect(qualityKarma(infected('crb.zap-vampire'), data, ON).pos).toBe(27)
  // (a `when` naming no metatype never holds)
  const e = data.entry('qualities', 'crb.zap-ghoul-glimmerkin')!
  expect(maxEffects(e)).toEqual({})
  expect(maxEffects(e, 'Glimmerkin').str).toEqual({ set: 3, add: 0 })
  expect(maxEffects({ ...e, parts: e.parts.map(p => ({ ...p, attrs: { ...p.attrs, when: 'while shifted' } })) }, 'Glimmerkin')).toEqual({})
})

test('an attribute above the new maximum drops to it, the spend not refunded (a Review warning)', () => {
  const b = buildOf('priority', { letters: 'CABDE', metatype: GLIM })
  b.attributes.str.points = 3 // STR 4
  const before = allBudgets(b, data, ON, makeProvider('priority', data, ON)).attributePoints.spent
  apply(b, { op: 'infected', id: 'crb.zap-ghoul-glimmerkin' }, data, ON)
  expect(deriveSr6(data, ON, runner(b)).attrs.str.natural).toBe(3)
  expect(allBudgets(b, data, ON, makeProvider('priority', data, ON)).attributePoints.spent).toBe(before)
  const v = validateSr6(data, ON, runner(b))
  expect(v.find(x => x.code === 'infected.dropped')).toMatchObject({ severity: 'warning', path: 'attributes.str' })
  expect(v.some(x => x.code === 'attr.creationMax' && x.path === 'attributes.str')).toBe(false)
})

test('2 free physical and 2 free mental points: counted as far as points go on attributes of that group', () => {
  const b = buildOf('priority', { letters: 'CABDE', metatype: GLIM })
  const max = () => allBudgets(b, data, ON, makeProvider('priority', data, ON)).attributePoints.max
  const base = max()
  apply(b, { op: 'infected', id: 'crb.zap-ghoul-glimmerkin' }, data, ON)
  expect(max()).toBe(base)
  b.attributes.agi.points = 1
  b.attributes.edg.points = 3
  expect(max()).toBe(base + 1)
  b.attributes.agi.points = 5
  b.attributes.log.points = 1
  b.attributes.cha.points = 4
  expect(max()).toBe(base + 4)
})

test('Strain II and III: Essence 5 (the type’s), Magic 1 for one without Magic, 1 less for one with it, highest 5 + grade', () => {
  const p = makeProvider('karma', data, ON)
  const g = infected('crb.zap-ghoul-glimmerkin')
  expect(allBudgets(g, data, ON, p).essence.max).toBe(4)
  expect(attrRating(g, 'mag', p)).toBe(1)
  expect(deriveSr6(data, ON, runner(g)).attrs.mag.natural).toBe(1)
  const a = infected('crb.zap-ghoul-glimmerkin', { magic: 'adept' })
  expect(attrRating(a, 'mag', p)).toBe(num(ON, 'karmaBuild.startRating')! - 1)
  a.initiation = 2
  expect(magicCap(a, ON, 'mag', data)).toBe(7)
  expect(deriveSr6(data, ON, runner(a)).magicMax).toBe(7)
  // Strain I: no Essence of its own (the setting's), highest Magic Essence + grade
  const l = infected('crb.zap-lurker', { magic: 'adept' })
  expect(allBudgets(l, data, ON, p).essence.max).toBe(num(ON, 'essence'))
  expect(magicCap(l, ON, 'mag', data)).toBe(num(ON, 'essence'))
})

test('Awakens: a mundane as the type’s kind, the other kind a mystic adept, a technomancer loses Resonance; taking it away gives the kind back', () => {
  const kind = (from: MagicKind, id: string) => {
    const b = infected(id, { magic: from })
    return [b.magic, b.infectedFrom]
  }
  expect(kind('mundane', 'crb.zap-lurker')).toEqual(['adept', 'mundane'])
  expect(kind('adept', 'crb.zap-lurker')).toEqual(['adept', undefined])
  expect(kind('full', 'crb.zap-lurker')).toEqual(['mystic-adept', 'full'])
  expect(kind('adept', 'crb.zap-vampire')).toEqual(['mystic-adept', 'adept'])
  expect(kind('technomancer', 'crb.zap-ghoul-glimmerkin')).toEqual(['mundane', 'technomancer'])
  expect(kind('mundane', 'crb.zap-ghoul-glimmerkin')).toEqual(['mundane', undefined])
  // the method still prices and rates the kind it bought: a mundane karma build pays no magic Karma for the adept
  const b = infected('crb.zap-lurker')
  expect(makeProvider('karma', data, ON).magicKarma!(b)).toBe(0)
  expect(codes(b)).not.toContain('prio.magicAllowed')
  // a priority change keeps the infection's kind (reconcile reads the bought one)
  const ch = runner(buildOf('priority', { letters: 'CABDE', metatype: GLIM }))
  apply(ch.build, { op: 'infected', id: 'crb.zap-lurker' }, data, ON)
  setPriority(ch, 'skills', 'B', data, ON)
  reconcile(ch, data, ON)
  expect([ch.build.magic, ch.build.infectedFrom]).toEqual(['adept', 'mundane'])
})

test('reversible: taking the type away (or another) restores the runner as it was', () => {
  for (const from of ['mundane', 'full', 'technomancer'] as MagicKind[]) {
    const b = buildOf('karma', { metatype: GLIM, magic: from })
    const before = structuredClone(b)
    apply(b, { op: 'infected', id: 'crb.zap-lurker' }, data, ON)
    apply(b, { op: 'infected', id: 'crb.zap-vampire' }, data, ON)
    expect(runnerInfected(b, data)?.t.id).toBe('crb.zap-vampire')
    expect(b.qualities).toHaveLength(1)
    apply(b, { op: 'quality', remove: b.qualities[0].uid }, data, ON)
    expect(b, from).toEqual(before)
  }
  // the Qualities picker's way takes the type the same way
  const b = buildOf('karma', { metatype: GLIM })
  apply(b, { op: 'quality', id: 'crb.zap-lurker' }, data, ON)
  expect([b.magic, b.infectedFrom]).toEqual(['adept', 'mundane'])
})

test('optional powers: only the type’s, at creation only its free pick (free), the rest after creation at their own Karma', () => {
  const take = (b: Sr6Build, id: string, cr = ON) => apply(b, { op: 'quality', id }, data, cr)
  expect(take(buildOf('karma', { metatype: GLIM }), 'crb.zap-power.glow')).toEqual({ ok: false, reason: 'infected-no-type' })
  const b = infected('crb.zap-lurker')
  expect(take(b, 'crb.zap-power.shell')).toEqual({ ok: false, reason: 'infected-not-listed' })
  expect(take(b, 'crb.zap-power.bite')).toEqual({ ok: false, reason: 'infected-after-creation' })
  expect(take(b, 'crb.zap-power.glow')).toEqual({ ok: true })
  expect(qualityKarma(b, data, ON).pos).toBe(30) // (the free pick: 0)
  expect(codes(b)).not.toContain('infected.power')
  // the GM's override: bought at creation, the free pick still free
  const gm = rules(true, true)
  expect(take(b, 'crb.zap-power.bite', gm)).toEqual({ ok: true })
  expect(qualityKarma(b, data, gm).pos).toBe(38)
  expect(codes(b)).toContain('infected.power') // (the table's rule off again: Review's error)
  expect(codes(b, gm)).not.toContain('infected.power')
  // after creation: its list, its own Karma (never times advance.qualityFactor), the free pick when not used
  expect(preview(career(infected('crb.zap-lurker')), q('crb.zap-power.bite'), data, ON)).toMatchObject({ ok: true, karma: 8 })
  expect(preview(career(infected('crb.zap-lurker')), q('crb.zap-power.glow'), data, ON)).toMatchObject({ ok: true, karma: 0 })
  expect(preview(career(b), q('crb.zap-power.shell'), data, ON)).toEqual({ ok: false, reason: 'infected-not-listed' })
  expect(preview(career(), q('crb.zap-power.glow'), data, ON)).toEqual({ ok: false, reason: 'infected-no-type' })
  expect(preview(career(b), q('crb.zap-ghoul-glimmerkin'), data, ON)).toEqual({ ok: false, reason: 'already-infected' })
})
