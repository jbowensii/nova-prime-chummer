// Build actions (src/sr6/engine/actions.ts) on the made-up fixture and its invented creation rules: method and letter
// switches mid-build, metatype traits, stacking purchases, life modules, SINs and licences, and the refusals.
import { expect, test } from 'vitest'
import { apply, reconcile, setMagic, setMetatype, setMethod, setPriority, type Op } from '../../src/sr6/engine/actions'
import { nuyenBudget, priced } from '../../src/sr6/engine/budgets'
import { makeProvider } from '../../src/sr6/engine/providers'
import { validateSr6 } from '../../src/sr6/engine/rules'
import { blankSr6, type MagicKind, type Sr6Character, type Sr6Method } from '../../src/sr6/model/character'
import { buildOf, GLIM, made, STONE } from './fixture'

type Over = Parameters<typeof made>[0]
function runner(o: { method?: Sr6Method; letters?: string; metatype?: string; magic?: MagicKind; over?: Over } = {}) {
  const ch: Sr6Character = blankSr6(o.method ?? 'priority', 'r1', '2026-10-03T00:00:00Z')
  ch.build = buildOf(o.method ?? 'priority', {
    letters: o.letters ?? (o.method && o.method !== 'priority' ? undefined : 'CABDA'),
    metatype: o.metatype ?? GLIM,
    magic: o.magic ?? 'mundane',
  })
  ch.identity.metatype = ch.build.metatype
  const { data, cr } = made(o.over)
  const act = (op: Op) => apply(ch.build, op, data, cr)
  return { ch, b: ch.build, data, cr, act }
}
const ok = { ok: true }
const no = (reason: string) => ({ ok: false, reason })

// method and letter switches
test('priority → point buy keeps the attribute points and clears the letters', () => {
  const { ch, b, data, cr, act } = runner()
  expect(act({ op: 'attribute', target: 'bod', pool: 'points', delta: 3 })).toEqual(ok)
  setMethod(ch, 'pointbuy', data, cr)
  expect(b.method).toBe('pointbuy')
  expect(Object.values(b.priorities).every(l => l === null)).toBe(true)
  expect(b.attributes.bod.points).toBe(3)
  expect(b.metatype).toBe(GLIM)
})

test('point buy → priority clears the character points; with no letters the metatype and magic go', () => {
  const { ch, b, data, cr, act } = runner({ method: 'pointbuy', magic: 'adept' })
  expect(act({ op: 'cp', pool: 'attribute', delta: 4 })).toEqual(ok)
  setMethod(ch, 'priority', data, cr)
  expect(b.cp.attribute).toBe(0)
  expect([b.metatype, ch.identity.metatype, b.magic]).toEqual(['', '', 'mundane'])
})

test('priority ↔ sum-to-ten keeps the letters; leaving lifepath drops the modules', () => {
  const { ch, b, data, cr } = runner()
  setMethod(ch, 'sumtoten', data, cr)
  expect(b.priorities.attributes).toBe('A')
  const l = runner({ method: 'lifepath', magic: 'full' })
  expect(l.act({ op: 'lifemodule', id: 'crb.wage-drone' })).toEqual(ok)
  setMethod(l.ch, 'karma', l.data, l.cr)
  expect(l.b.lifepath).toEqual([])
})

test('a metatype letter that no longer offers the metatype clears it and its traits', () => {
  const { ch, b, data, cr } = runner({
    metatype: STONE,
    over: {
      data: d => {
        delete d.priorities.D!.metatypes[STONE]
      },
    },
  })
  setMetatype(ch, STONE, data)
  expect(b.qualities.map(q => q.id)).toEqual(['crb.stoneskin'])
  setPriority(ch, 'metatype', 'D', data, cr)
  expect([b.metatype, ch.identity.metatype, b.qualities]).toEqual(['', '', []])
})

test('a magic letter that no longer offers full magic makes the runner mundane and the spells go', () => {
  const { ch, b, data, cr, act } = runner({ letters: 'CBADE', magic: 'full' })
  expect(act({ op: 'pick', kind: 'spells', id: 'crb.glow-ward' })).toEqual(ok)
  b.initiation = 2
  setPriority(ch, 'magic', 'D', data, cr)
  expect([b.magic, b.picks, b.initiation]).toEqual(['mundane', [], 0])
  // a letter that still offers it changes nothing
  const r = runner({ letters: 'CBADE', magic: 'full' })
  setPriority(r.ch, 'magic', 'B', r.data, r.cr)
  expect(r.b.magic).toBe('full')
})

test('setMagic drops what the kind can’t have and the bought power points; aspected keeps its skill', () => {
  const { ch, b, data, cr, act } = runner({ letters: 'CBBDE', magic: 'mystic-adept' })
  act({ op: 'pick', kind: 'spells', id: 'crb.glow-ward' })
  act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })
  act({ op: 'powerPoints', delta: 2 })
  setMagic(ch, 'adept', data, cr)
  expect(b.picks.map(x => x.kind)).toEqual(['adeptpowers'])
  expect(b.powerPointsBought).toBe(0)
  setMagic(ch, 'aspected', data, cr, 'crb.hexing')
  expect([b.picks, b.aspectedSkill]).toEqual([[], 'crb.hexing'])
  setMagic(ch, 'full', data, cr)
  expect(b.aspectedSkill).toBeUndefined()
})

test('setMagic: spends on Magic or Resonance go with the attribute, so no hidden row keeps holding points', () => {
  const { ch, b, data, cr, act } = runner({ magic: 'full' })
  expect(act({ op: 'attribute', target: 'mag', pool: 'points', delta: 2 })).toEqual(ok)
  expect(act({ op: 'attribute', target: 'mag', pool: 'karma', delta: 1 })).toEqual(ok)
  setMagic(ch, 'adept', data, cr) // still has Magic
  expect(b.attributes.mag).toEqual({ points: 2, adjust: 0, karma: 1 })
  setMagic(ch, 'technomancer', data, cr)
  expect(b.attributes.mag).toEqual({ points: 0, adjust: 0, karma: 0 })
  expect(act({ op: 'attribute', target: 'res', pool: 'adjust', delta: 1 })).toEqual(ok)
  setMagic(ch, 'mundane', data, cr)
  expect(b.attributes.res).toEqual({ points: 0, adjust: 0, karma: 0 })
})

test('reconcile leaves a legal build alone', () => {
  const { ch, b, data, cr } = runner({ magic: 'full' })
  const before = structuredClone(b)
  reconcile(ch, data, cr)
  expect(b).toEqual(before)
})

// metatypes and qualities
test('a metatype swap moves the free traits and keeps the paid qualities; a free trait can’t be removed', () => {
  const { ch, b, data, act } = runner()
  setMetatype(ch, STONE, data)
  expect(act({ op: 'quality', id: 'crb.butterfingers' })).toEqual(ok)
  const trait = b.qualities.find(q => q.free)!
  expect([trait.id, trait.name, ch.identity.metatype]).toEqual(['crb.stoneskin', 'Stoneskin', STONE])
  expect(act({ op: 'quality', remove: trait.uid })).toEqual(no('free-trait'))
  setMetatype(ch, GLIM, data)
  expect(b.qualities.map(q => q.id)).toEqual(['crb.butterfingers'])
  expect(ch.identity.metatype).toBe(GLIM)
})

test('a quality priced in a range takes the karma chosen within it; one with a single price refuses it', () => {
  const { b, act } = runner({
    over: {
      data: d => {
        d.qualities['crb.butterfingers'].karmaMax = 14
      },
    },
  })
  expect(act({ op: 'quality', id: 'crb.butterfingers', karma: 12 })).toEqual(ok)
  expect(act({ op: 'quality', id: 'crb.butterfingers', karma: 13 })).toEqual(ok)
  expect(b.qualities.map(q => [q.id, q.level, q.karma])).toEqual([['crb.butterfingers', 1, 13]])
  expect(act({ op: 'quality', id: 'crb.butterfingers', karma: 15 })).toEqual(no('karma-range'))
  expect(act({ op: 'quality', id: 'crb.butterfingers', karma: 7 })).toEqual(no('karma-range'))
  expect(act({ op: 'quality', id: 'crb.knack', karma: 5 })).toEqual(no('karma-range'))
})

test('qualities: taken once, a level within the highest, removed by uid', () => {
  const { b, act } = runner()
  expect(act({ op: 'quality', id: 'crb.lucky-streak', level: 2 })).toEqual(ok)
  expect(act({ op: 'quality', id: 'crb.knack' })).toEqual(ok)
  expect(act({ op: 'quality', id: 'crb.knack' })).toEqual(no('already-taken'))
  // (a leveled quality is one entry per level, levels.ts: the line moves to the level's entry, at level 1)
  expect(b.qualities[0]).toMatchObject({ id: 'crb.lucky-streak.2', level: 1, name: 'Lucky Streak 2' })
  expect(act({ op: 'quality', id: 'crb.lucky-streak', level: 3 })).toEqual(ok)
  expect(b.qualities[0]).toMatchObject({ id: 'crb.lucky-streak.3', level: 1 })
  expect(act({ op: 'quality', id: 'crb.lucky-streak.3' })).toEqual(no('already-taken'))
  expect(act({ op: 'quality', id: 'crb.lucky-streak.3', level: 1 })).toEqual(ok)
  expect(b.qualities[0].id).toBe('crb.lucky-streak.1')
  expect(act({ op: 'quality', id: 'crb.lucky-streak', level: 4 })).toEqual(no('max-level'))
  expect(act({ op: 'quality', id: 'crb.lucky-streak', level: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'quality', id: 'crb.knack', level: 2 })).toEqual(no('no-levels'))
  expect(act({ op: 'quality', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(act({ op: 'quality', remove: b.qualities[1].uid })).toEqual(ok)
  expect(b.qualities.map(q => q.id)).toEqual(['crb.lucky-streak.1'])
  expect(act({ op: 'quality', remove: 'gone' })).toEqual(no('not-taken'))
})

// spends
test('a spend below zero is refused and changes nothing', () => {
  const { b, act } = runner({ method: 'pointbuy' })
  expect(act({ op: 'attribute', target: 'agi', pool: 'karma', delta: -1 })).toEqual(no('below-zero'))
  expect(act({ op: 'skill', target: 'crb.gab', pool: 'points', delta: -1 })).toEqual(no('below-zero'))
  expect(act({ op: 'cp', pool: 'skill', delta: -1 })).toEqual(no('below-zero'))
  expect(act({ op: 'powerPoints', delta: -1 })).toEqual(no('below-zero'))
  expect(act({ op: 'initiation', delta: -1 })).toEqual(no('below-zero'))
  expect(act({ op: 'karmaToNuyen', delta: -1 })).toEqual(no('below-zero'))
  expect(b.attributes.agi.karma + b.skills.length + b.cp.skill).toBe(0)
})

test('skills: points and karma ranks, a spec and expertise (taken without a rank too) go with the rank', () => {
  const { ch, b, data, cr, act } = runner()
  // without a rank: taken, an error a GM may approve
  expect(act({ op: 'spec', target: 'crb.gab', spec: 'Haggling' })).toEqual(ok)
  expect(b.skills).toEqual([{ id: 'crb.gab', points: 0, karma: 0, spec: 'Haggling' }])
  const v = validateSr6(data, cr, ch).filter(x => x.code === 'skill.specUntrained')
  expect(v.map(x => [x.severity, x.path, x.source, x.page])).toEqual([['error', 'skills.crb.gab', 'CRB', 93]])
  ch.overrides = [{ code: 'skill.specUntrained', path: 'skills.crb.gab', note: 'GM ok' }]
  expect(validateSr6(data, cr, ch).find(x => x.code === 'skill.specUntrained')?.approved).toBe(true)
  expect(act({ op: 'spec', target: 'crb.gab', spec: null })).toEqual(ok)
  expect(b.skills).toEqual([])
  expect(act({ op: 'spec', target: 'crb.nope', spec: 'Haggling' })).toEqual(no('unknown-entry'))
  expect(act({ op: 'skill', target: 'crb.gab', pool: 'karma', delta: 1 })).toEqual(ok)
  expect(act({ op: 'spec', target: 'crb.gab', spec: 'Haggling' })).toEqual(ok)
  expect(act({ op: 'expertise', target: 'crb.gab', expertise: 'Fibbing' })).toEqual(ok)
  expect(b.skills).toEqual([{ id: 'crb.gab', points: 0, karma: 1, spec: 'Haggling', expertise: 'Fibbing' }])
  expect(act({ op: 'skill', target: 'crb.gab', pool: 'karma', delta: -1 })).toEqual(ok)
  expect(b.skills).toEqual([])
  expect(act({ op: 'skill', target: 'crb.nope', pool: 'points', delta: 1 })).toEqual(no('unknown-entry'))
})

test('character points only in point buy; karma to nuyen up to its most', () => {
  const { b, act } = runner()
  expect(act({ op: 'cp', pool: 'attribute', delta: 1 })).toEqual(no('not-point-buy'))
  expect(act({ op: 'karmaToNuyen', delta: 7 })).toEqual(ok)
  expect(act({ op: 'karmaToNuyen', delta: 1 })).toEqual(no('conversion-cap'))
  expect(b.karmaToNuyen).toBe(7)
  const free = runner({ over: { unset: ['karmaToNuyenMax'] } })
  expect(free.act({ op: 'karmaToNuyen', delta: 40 })).toEqual(ok)
})

test('initiation needs an awakened runner, submersion an emerged one', () => {
  expect(runner().act({ op: 'initiation', delta: 1 })).toEqual(no('not-awakened'))
  expect(runner({ magic: 'adept', letters: 'CABDE' }).act({ op: 'initiation', delta: 1 })).toEqual(ok)
  expect(runner({ magic: 'full' }).act({ op: 'submersion', delta: 1 })).toEqual(no('not-emerged'))
  expect(runner({ magic: 'technomancer' }).act({ op: 'submersion', delta: 1 })).toEqual(ok)
})

// magic picks
test('adept powers: a power without levels twice is a duplicate; a leveled one rises to its highest level', () => {
  // (a leveled power is one entry per level, levels.ts: taken again, the line moves to the next level's entry)
  const { b, act } = runner({ letters: 'CBBDE', magic: 'adept' })
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })).toEqual(ok)
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })).toEqual(ok)
  expect(b.picks).toHaveLength(1)
  expect(b.picks[0]).toMatchObject({ id: 'crb.quick-step.2', name: 'Quick Step 2' })
  expect(b.picks[0].level).toBeUndefined()
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step.1' })).toEqual(no('duplicate'))
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step.4' })).toEqual(ok)
  expect(b.picks[0].id).toBe('crb.quick-step.4')
  expect(act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })).toEqual(no('max-level'))
  expect(act({ op: 'powerLevel', uid: b.picks[0].uid, level: 1 })).toEqual(ok)
  expect(b.picks[0].id).toBe('crb.quick-step.1')
  expect(act({ op: 'powerLevel', uid: b.picks[0].uid, level: 5 })).toEqual(no('max-level'))
  expect(act({ op: 'powerLevel', uid: b.picks[0].uid, level: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'pick', kind: 'spells', id: 'crb.glow-ward' })).toEqual(ok)
  expect(act({ op: 'pick', kind: 'spells', id: 'crb.glow-ward' })).toEqual(no('duplicate'))
  expect(act({ op: 'powerLevel', uid: b.picks[1].uid, level: 2 })).toEqual(no('no-levels'))
  expect(act({ op: 'pick', remove: b.picks[1].uid })).toEqual(ok)
  expect(b.picks.map(x => x.name)).toEqual(['Quick Step 1'])
  // a power taken by level with no printed maximum stays one entry, its level on the line
  const open = runner({
    magic: 'adept',
    letters: 'CBBDE',
    over: {
      data: d => {
        d.powers['crb.static-veil'] = { id: 'crb.static-veil', name: 'Static Veil', cost: 0.5, perLevel: true, maxLevel: 2, page: 1 }
        const e = d.entry
        d.entry = (k, id) =>
          id === 'crb.static-veil'
            ? { id, kind: 'adeptpowers', name: 'Static Veil', source: 'CRB', page: 1, attrs: { perLevel: 'true', maxLevel: '2' }, parts: [], text: '' }
            : e(k, id)
      },
    },
  })
  expect(open.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.static-veil' })).toEqual(ok)
  expect(open.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.static-veil' })).toEqual(ok)
  expect(open.b.picks[0]).toMatchObject({ id: 'crb.static-veil', level: 2 })
  expect(open.act({ op: 'pick', kind: 'adeptpowers', id: 'crb.static-veil' })).toEqual(no('max-level'))
})

// purchases (Forge's stacking tests)
test('two Zap Guns are two lines and an accessory fits one; ammo stacks; the price is the same either way', () => {
  const { b, data, cr, act } = runner()
  expect(act({ op: 'purchase', kind: 'weapons', id: 'crb.zap-gun' })).toEqual(ok)
  expect(act({ op: 'purchase', kind: 'weapons', id: 'crb.zap-gun' })).toEqual(ok)
  expect(b.purchases.map(x => x.qty)).toEqual([1, 1])
  const [gun1, gun2] = b.purchases
  expect(act({ op: 'accessory', host: gun1.uid, kind: 'gear', id: 'crb.zap-scope' })).toEqual(ok)
  expect([gun1.accessories.map(a => a.id), gun2.accessories]).toEqual([['crb.zap-scope'], []])
  act({ op: 'purchase', kind: 'gear', id: 'crb.zap-pellets' })
  act({ op: 'purchase', kind: 'gear', id: 'crb.zap-pellets' })
  expect(b.purchases).toHaveLength(3)
  expect(b.purchases[2].qty).toBe(2)
  const p = makeProvider(b.method, data, cr)
  expect(nuyenBudget(b, data, cr, p).spent).toBe(2 * 290 + 350 + 2 * 21)
  expect(act({ op: 'accessory', host: gun1.uid, remove: gun1.accessories[0].uid })).toEqual(ok)
  expect(act({ op: 'accessory', host: 'nope', kind: 'gear', id: 'crb.zap-scope' })).toEqual(no('unknown-host'))
  expect(act({ op: 'quantity', uid: b.purchases[2].uid, qty: 5 })).toEqual(ok)
  expect(act({ op: 'quantity', uid: gun1.uid, qty: 2 })).toEqual(no('own-line'))
  expect(act({ op: 'purchase', remove: gun2.uid })).toEqual(ok)
  expect(b.purchases.map(x => x.id)).toEqual(['crb.zap-gun', 'crb.zap-pellets'])
})

test('rated gear stacks by id and rating; a rating outside the range or an ungraded grade is refused', () => {
  const { b, act } = runner()
  // (a rated item is one entry per rating, levels.ts: the line holds the rating's entry, no rating of its own)
  act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', rating: 2 })
  act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope.3' })
  act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', rating: 2, qty: 2 })
  expect(b.purchases.map(x => [x.id, x.rating, x.qty])).toEqual([
    ['crb.tangle-rope.2', undefined, 3],
    ['crb.tangle-rope.3', undefined, 1],
  ])
  expect(act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', rating: 5 })).toEqual(no('rating-range'))
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, grade: 'delta' })).toEqual(no('unknown-grade'))
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, grade: 'alpha' })).toEqual(ok)
  expect(act({ op: 'purchase', kind: 'weapons', id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(act({ op: 'purchase', kind: 'gear', id: 'crb.zap-pellets', qty: 0 })).toEqual(no('below-one'))
})

test('a line’s rating and grade change in place; out of range, an unset grade or a line without ratings is refused', () => {
  const { b, act } = runner()
  act({ op: 'purchase', kind: 'augmentations', id: 'crb.glow-eyes', rating: 2, grade: 'alpha' })
  act({ op: 'purchase', kind: 'weapons', id: 'crb.zap-gun' })
  const [eyes, gun] = b.purchases
  expect(act({ op: 'rate', uid: eyes.uid, rating: 3 })).toEqual(ok)
  expect(act({ op: 'rate', uid: eyes.uid, grade: 'standard' })).toEqual(ok)
  expect(b.purchases[0]).toMatchObject({ uid: eyes.uid, id: 'crb.glow-eyes.3', grade: 'standard' }) // (the rating's entry, levels.ts)
  expect(act({ op: 'rate', uid: eyes.uid, grade: null })).toEqual(ok)
  expect(b.purchases[0].grade).toBeUndefined()
  expect(act({ op: 'rate', uid: eyes.uid, rating: 9 })).toEqual(no('rating-range'))
  expect(act({ op: 'rate', uid: eyes.uid, grade: 'delta' })).toEqual(no('unknown-grade'))
  expect(act({ op: 'rate', uid: gun.uid, rating: 2 })).toEqual(no('rating-range'))
  expect(act({ op: 'rate', uid: 'nope', rating: 2 })).toEqual(no('unknown-line'))
  expect(b.purchases[0]).toMatchObject({ id: 'crb.glow-eyes.3' })
})

test('only cyberware and bioware come in grades: one on geneware is taken, an error a GM may approve; gear is refused one', () => {
  const genes = {
    id: 'crb.glow-genes',
    kind: 'augmentations' as const,
    name: 'Glow Genes',
    source: 'CRB',
    page: 1,
    attrs: { type: 'geneware', category: 'made-up', essence: '0.1', cost: '900' },
    parts: [],
    text: '',
  }
  const dark = { ...genes, id: 'crb.dark-genes', name: 'Dark Genes' }
  const { ch, b, data, cr, act } = runner({
    over: {
      data: d => {
        const old = d.entry
        d.entry = (k, id) => (id === genes.id ? genes : id === dark.id ? dark : old(k, id))
      },
    },
  })
  expect(act({ op: 'purchase', kind: 'augmentations', id: genes.id, grade: 'alpha' })).toEqual(ok)
  expect(act({ op: 'purchase', kind: 'augmentations', id: dark.id })).toEqual(ok)
  expect(act({ op: 'rate', uid: b.purchases[1].uid, grade: 'alpha' })).toEqual(ok)
  const v = validateSr6(data, cr, ch).filter(x => x.code === 'gear.grade')
  expect(v.map(x => [x.severity, x.path, x.source, x.page, x.message])).toEqual(
    [0, 1].map(i => ['error', `augmentations.${b.purchases[i].uid}`, 'CRB', 283, `${['Glow', 'Dark'][i]} Genes (geneware) doesn’t come in Alpha.`]),
  )
  ch.overrides = [{ code: 'gear.grade', path: v[0].path, note: 'GM ok' }]
  expect(
    validateSr6(data, cr, ch)
      .filter(x => x.code === 'gear.grade')
      .map(x => !!x.approved),
  ).toEqual([true, false])
  expect(act({ op: 'purchase', kind: 'gear', id: 'crb.tangle-rope', rating: 2, grade: 'alpha' })).toEqual(no('no-grade'))
  expect(act({ op: 'purchase', kind: 'augmentations', id: 'crb.spring-tendons', rating: 1, grade: 'alpha' })).toEqual(ok)
})

test('a custom item is bought at the player’s cost', () => {
  const { b, data, cr, act } = runner()
  expect(act({ op: 'purchase', kind: 'gear', custom: { name: 'Lucky Coin', cost: 777, avail: 2, essence: 0 } })).toEqual(ok)
  expect(b.purchases[0]).toMatchObject({ kind: 'gear', name: 'Lucky Coin', cost: 777, avail: 2, qty: 1 })
  expect(b.purchases[0].id).toBeUndefined()
  expect(priced(b.purchases[0], data, cr).cost).toBe(777)
})

test('worn armor and entered bonuses', () => {
  const { b, act } = runner({ letters: 'CBBDE', magic: 'adept' })
  act({ op: 'purchase', kind: 'armor', id: 'crb.padded-vest' })
  expect(act({ op: 'wear', uid: b.purchases[0].uid, worn: true })).toEqual(ok)
  expect(b.purchases[0].worn).toBe(true)
  act({ op: 'wear', uid: b.purchases[0].uid, worn: false })
  expect('worn' in b.purchases[0]).toBe(false)
  act({ op: 'pick', kind: 'adeptpowers', id: 'crb.quick-step' })
  expect(act({ op: 'bonus', uid: b.picks[0].uid, bonuses: [{ target: 'rea', value: 1 }] })).toEqual(ok)
  expect(b.picks[0].bonuses).toEqual([{ target: 'rea', value: 1 }])
  expect(act({ op: 'bonus', uid: 'nope', bonuses: [] })).toEqual(no('unknown-line'))
})

// contacts, knowledge, lifestyle
test('contacts and knowledge are added, changed and removed by uid', () => {
  const { b, act } = runner()
  expect(act({ op: 'contact', name: 'Fixer Flo', archetype: 'fixer', connection: 3, loyalty: 2 })).toEqual(ok)
  expect(act({ op: 'contact', uid: b.contacts[0].uid, loyalty: 4 })).toEqual(ok)
  expect(b.contacts[0]).toMatchObject({ name: 'Fixer Flo', connection: 3, loyalty: 4 })
  expect(act({ op: 'contact', uid: b.contacts[0].uid, loyalty: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'contact', remove: b.contacts[0].uid })).toEqual(ok)
  expect(b.contacts).toEqual([])
  expect(act({ op: 'knowledge', name: 'Sewer Maps', kind: 'knowledge' })).toEqual(ok)
  expect(act({ op: 'knowledge', name: 'Gutterspeak', kind: 'language', native: true })).toEqual(ok)
  expect(b.knowledge.map(k => [k.name, k.points])).toEqual([
    ['Sewer Maps', 1],
    ['Gutterspeak', 0],
  ])
  expect(act({ op: 'knowledgeRank', uid: b.knowledge[0].uid, pool: 'karma', delta: 2 })).toEqual(ok)
  expect(act({ op: 'knowledgeRank', uid: b.knowledge[1].uid, pool: 'points', delta: 1 })).toEqual(no('native'))
  expect(act({ op: 'knowledge', remove: b.knowledge[1].uid })).toEqual(ok)
  expect(b.knowledge.map(k => [k.name, k.karma])).toEqual([['Sewer Maps', 2]])
})

test('a lifestyle belongs to a SIN: added, changed and removed on it; a SIN has an optional gender', () => {
  const { b, act } = runner()
  expect(act({ op: 'lifestyle', sin: 'nope', id: 'crb.cozy' })).toEqual(no('unknown-line'))
  expect(act({ op: 'sin', name: 'Jo Blue', kind: 'fake', gender: 'Nonbinary' })).toEqual(ok)
  expect(act({ op: 'sin', name: 'Real Me', kind: 'real' })).toEqual(ok)
  const [fake, real] = b.sins
  expect(fake.gender).toBe('Nonbinary')
  expect(act({ op: 'lifestyle', sin: fake.uid, id: 'crb.cozy', months: 2 })).toEqual(ok)
  expect(act({ op: 'lifestyle', sin: fake.uid, id: 'crb.nope' })).toEqual(no('unknown-entry'))
  expect(act({ op: 'lifestyle', sin: fake.uid })).toEqual(no('unknown-entry'))
  const l = fake.lifestyles![0]
  expect(l).toMatchObject({ id: 'crb.cozy', months: 2 })
  expect(act({ op: 'lifestyle', sin: fake.uid, uid: l.uid, months: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'lifestyle', sin: fake.uid, uid: l.uid, months: 5 })).toEqual(ok)
  expect(fake.lifestyles).toEqual([{ uid: l.uid, id: 'crb.cozy', months: 5 }])
  expect(real.lifestyles).toBeUndefined() // a SIN may have none
  expect(act({ op: 'lifestyle', sin: fake.uid, remove: l.uid })).toEqual(ok)
  expect(fake.lifestyles).toBeUndefined()
  expect(act({ op: 'sin', uid: fake.uid, gender: '' })).toEqual(ok)
  expect(fake.gender).toBeUndefined()
})

test('a placeholder SIN is free; naming it or setting its kind makes it a normal SIN, a gender alone doesn’t', () => {
  const { b, data, cr, act } = runner()
  const p = makeProvider(b.method, data, cr)
  const holder = () => ({
    uid: 'ph',
    name: '',
    kind: 'real' as const,
    licences: [],
    placeholder: true as const,
    lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 1 }],
  })
  b.sins = [holder()]
  const lines = () => nuyenBudget(b, data, cr, p).breakdown.filter(l => l.key.startsWith('sin:') || l.key.startsWith('lifestyle:'))
  expect(lines()).toEqual([{ key: 'lifestyle:l1', label: 'Cozy lifestyle × 1 month (Unnamed SIN)', amount: 2500, sign: 'spend', tab: 'contacts' }])
  expect(act({ op: 'sin', uid: 'ph', gender: 'Other' })).toEqual(ok)
  expect(b.sins[0].placeholder).toBe(true)
  expect(act({ op: 'sin', uid: 'ph', name: 'Jo Placeholder' })).toEqual(ok)
  expect(b.sins[0]).toEqual({
    uid: 'ph',
    name: 'Jo Placeholder',
    kind: 'real',
    gender: 'Other',
    licences: [],
    lifestyles: [{ uid: 'l1', id: 'crb.cozy', months: 1 }],
  })
  // made fake: rating 1, priced as any fake SIN; back to real drops the rating
  b.sins = [holder()]
  expect(act({ op: 'sin', uid: 'ph', kind: 'fake' })).toEqual(ok)
  expect(b.sins[0]).toMatchObject({ kind: 'fake', rating: 1 })
  expect(b.sins[0].placeholder).toBeUndefined()
  expect(lines().find(l => l.key === 'sin:ph')).toMatchObject({ label: 'SIN (fake SIN, rating 1)', amount: 1500 })
  expect(act({ op: 'licence', sin: 'ph', name: 'Zapper' })).toEqual(ok)
  expect(act({ op: 'sin', uid: 'ph', kind: 'real' })).toEqual(ok)
  expect('rating' in b.sins[0]).toBe(false)
  expect(act({ op: 'sin', uid: 'ph', kind: 'fake', rating: 2 })).toEqual(ok)
  expect(b.sins[0].rating).toBe(2)
  expect(b.sins[0].licences).toEqual([{ name: 'Zapper', rating: 2 }])
  expect(act({ op: 'sin', uid: 'ph', kind: 'real' })).toEqual(ok)
  expect(b.sins[0].licences).toEqual([{ name: 'Zapper', rating: 1 }])
})

// life modules
test('life modules: a mixed choice is stored by its index; a module twice only as the setting allows', () => {
  const { b, act } = runner({ method: 'lifepath', magic: 'full', over: { unset: ['lifepath.repeatModules'] } })
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice' })).toEqual(ok)
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice' })).toEqual(no('already-taken'))
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice', choice: 0, pick: 'nuyen:3000' })).toEqual(ok)
  expect(b.lifepath).toEqual([{ id: 'crb.glow-apprentice', choices: { 0: 'nuyen:3000' } }])
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice', choice: 0, pick: 'agi' })).toEqual(no('unknown-option'))
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice', choice: 1, pick: 'edg' })).toEqual(no('unknown-choice'))
  expect(act({ op: 'lifemodule', id: 'crb.hatchling-days' })).toEqual(no('not-available'))
  expect(act({ op: 'lifemodule', remove: 'crb.glow-apprentice' })).toEqual(ok)
  expect(b.lifepath).toEqual([])
  // a mundane takes a module that requires an awakened runner: an error a GM may approve; outside lifepath nothing is taken
  const mundane = runner({ method: 'lifepath' })
  expect(mundane.act({ op: 'lifemodule', id: 'crb.glow-apprentice' })).toEqual(ok)
  const v = validateSr6(mundane.data, mundane.cr, mundane.ch).filter(x => x.code === 'lifepath.requires')
  expect(v.map(x => [x.severity, x.path, x.message])).toEqual([
    ['error', 'method.crb.glow-apprentice', 'Glow Apprentice is for an awakened runner, not a mundane.'],
  ])
  expect(v[0].page).toBeGreaterThan(0)
  mundane.ch.overrides = [{ code: 'lifepath.requires', path: 'method.crb.glow-apprentice', note: 'GM ok' }]
  expect(validateSr6(mundane.data, mundane.cr, mundane.ch).find(x => x.code === 'lifepath.requires')?.approved).toBe(true)
  expect(runner().act({ op: 'lifemodule', id: 'crb.wage-drone' })).toEqual(no('not-lifepath'))
})

test('life modules: one taken twice keeps a choice per copy; remove takes the one asked for', () => {
  const { b, act } = runner({ method: 'lifepath', magic: 'full' })
  for (const id of ['crb.glow-apprentice', 'crb.wage-drone', 'crb.glow-apprentice']) expect(act({ op: 'lifemodule', id })).toEqual(ok)
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice' })).toEqual(no('already-taken')) // a third time
  expect(act({ op: 'lifemodule', id: 'crb.wage-drone' })).toEqual(no('already-taken')) // a second doubled module
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice', choice: 0, pick: 'edg', at: 2 })).toEqual(ok)
  expect(act({ op: 'lifemodule', id: 'crb.glow-apprentice', choice: 0, pick: 'agi', at: 1 })).toEqual(no('not-taken'))
  expect(b.lifepath.map(m => m.choices)).toEqual([{}, {}, { 0: 'edg' }])
  expect(act({ op: 'lifemodule', remove: 'crb.glow-apprentice', at: 0 })).toEqual(ok)
  expect(b.lifepath).toEqual([
    { id: 'crb.wage-drone', choices: {} },
    { id: 'crb.glow-apprentice', choices: { 0: 'edg' } },
  ])
})

test('the best attribute: a core attribute, lifepath only; none clears the extra', () => {
  const { b, act } = runner({ method: 'lifepath' })
  expect(act({ op: 'bestAttr', attr: 'str', extra: 'log' })).toEqual(ok)
  expect([b.bestAttr, b.bestExtra]).toEqual(['str', 'log'])
  expect(act({ op: 'bestAttr', attr: 'edg' })).toEqual(no('not-core'))
  expect(act({ op: 'bestAttr', attr: 'str', extra: 'mag' })).toEqual(no('not-core'))
  expect(act({ op: 'bestAttr', attr: null })).toEqual(ok)
  expect([b.bestAttr, b.bestExtra]).toEqual([undefined, undefined])
  expect(runner().act({ op: 'bestAttr', attr: 'str' })).toEqual(no('not-lifepath'))
})

test('a contact’s types: one or two known ones, an empty list clears them', () => {
  const { b, act } = runner({ method: 'lifepath' })
  expect(act({ op: 'contact', types: ['street'] })).toEqual(ok)
  const uid = b.contacts[0].uid
  expect(act({ op: 'contact', uid, types: ['street', 'magic', 'media'] })).toEqual(no('bad-types'))
  expect(act({ op: 'contact', uid, types: ['street', 'magic'] })).toEqual(ok)
  expect(b.contacts[0].types).toEqual(['street', 'magic'])
  expect(act({ op: 'contact', uid, types: [] })).toEqual(ok)
  expect(b.contacts[0].types).toBeUndefined()
})

test('no more adult modules than the setting asks for', () => {
  const { act } = runner({ method: 'lifepath', over: { rules: { 'lifepath.moduleCount': 1 } } })
  expect(act({ op: 'lifemodule', id: 'crb.wage-drone' })).toEqual(ok)
  expect(act({ op: 'lifemodule', id: 'crb.dock-rat' })).toEqual(no('module-count'))
})

// SINs and licences
test('a licence is rated as its fake SIN and re-priced with it; ratings up to 6 are accepted; the alias typed is kept', () => {
  const { b, act, data, cr } = runner()
  expect(act({ op: 'sin', name: 'Jo Blue', kind: 'fake', rating: 6 })).toEqual(ok)
  const sin = b.sins[0]
  expect(sin).toMatchObject({ name: 'Jo Blue', kind: 'fake', rating: 6, licences: [] })
  expect(act({ op: 'licence', sin: sin.uid, name: 'Zap Gun licence' })).toEqual(ok)
  expect(sin.licences).toEqual([{ name: 'Zap Gun licence', rating: 6 }])
  const cost = () => nuyenBudget(b, data, cr, makeProvider(b.method, data, cr)).breakdown.find(l => l.key === `sin:${sin.uid}`)?.amount
  const at6 = cost()!
  expect(act({ op: 'sin', uid: sin.uid, rating: 3 })).toEqual(ok)
  expect(sin.licences).toEqual([{ name: 'Zap Gun licence', rating: 3 }])
  expect(cost()).toBe(at6 / 2) // (the SIN and its licence, both by rating)
  expect(act({ op: 'licence', sin: sin.uid, name: 'Driver' })).toEqual(ok)
  expect(sin.licences[1]).toEqual({ name: 'Driver', rating: 3 })
  expect(act({ op: 'sin', name: 'Real Me', kind: 'real' })).toEqual(ok)
  expect(b.sins[1].rating).toBeUndefined()
  expect(act({ op: 'licence', sin: b.sins[1].uid, name: 'Hunting' })).toEqual(ok)
  expect(b.sins[1].licences).toEqual([{ name: 'Hunting', rating: 1 }])
  expect(act({ op: 'sin', name: 'Bad', kind: 'fake', rating: 0 })).toEqual(no('below-one'))
  expect(act({ op: 'sin', remove: sin.uid })).toEqual(ok)
  expect(b.sins.map(s => s.name)).toEqual(['Real Me'])
})
