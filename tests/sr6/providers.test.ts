// Budget providers for the five creation methods (src/sr6/engine/providers.ts), on the made-up fixture catalog and its
// invented creation rules (tests/fixtures/sr6/custom). Each SR6 Forge provider test re-expressed with invented numbers.
import { expect, test } from 'vitest'
import type { MagicKind, Sr6Build, Sr6Method } from '../../src/sr6/model/character'
import { attrRating, karmaBudget } from '../../src/sr6/engine/budgets'
import { makeProvider, uncovered } from '../../src/sr6/engine/providers'
import { buildOf as build, GLIM, made, STONE } from './fixture'

const setup = (method: Sr6Method, over?: Parameters<typeof made>[0]) => { const { data, cr } = made(over); return makeProvider(method, data, cr) }

// priority budgets
test('priority: the table values per letter, and the starting karma', () => {
  const p = setup('priority'), b = build('priority', { letters: 'CABDE', metatype: GLIM })
  expect(p.id).toBe('priority')
  expect(p.attributePoints(b)).toBe(22)
  expect(p.skillPoints(b)).toBe(11)
  expect(p.nuyen(b)).toBe(8200)
  expect(p.startingKarma()).toBe(40)
})

test('priority: adjustment points depend on the metatype at the METATYPE letter', () => {
  const p = setup('priority')
  expect(p.adjustmentPoints(build('priority', { letters: 'ABCDE', metatype: STONE }))).toBe(11)
  expect(p.adjustmentPoints(build('priority', { letters: 'CABDE', metatype: GLIM }))).toBe(7)
  expect(p.adjustmentPoints(build('priority', { letters: 'CABDE' }))).toBe(0)
  expect(p.legalMetatypes(build('priority', { letters: 'BACDE' }))).toEqual([
    { id: GLIM, name: 'Glimmerkin', adjustmentPoints: 11 }, { id: STONE, name: 'Stonefolk', adjustmentPoints: 9 }])
})

test('priority: the magic rating comes from the MAGIC letter', () => {
  const p = setup('priority')
  expect(p.magicRating(build('priority', { letters: 'DBACE', magic: 'full' }))).toBe(4)
  expect(p.magicRating(build('priority', { letters: 'DCBAE', magic: 'aspected' }))).toBe(5)
  expect(p.magicRating(build('priority', { letters: 'DCBAE', magic: 'mundane' }))).toBe(0)
})

// legality
test('priority: duplicate or missing letters are invalid', () => {
  const p = setup('priority')
  expect(p.lettersValid(build('priority', { letters: 'ABCDE' }).priorities)).toBe(true)
  expect(p.lettersValid(build('priority', { letters: 'AACDE' }).priorities)).toBe(false)
  expect(p.lettersValid(build('priority').priorities)).toBe(false)
})

test('priority: a metatype absent from the METATYPE row is not legal', () => {
  const p = setup('priority', { data: d => { delete d.priorities.A!.metatypes[STONE] } })
  expect(p.legalMetatypes(build('priority', { letters: 'ABCDE' })).map(m => m.id)).toEqual([GLIM])
  expect(p.legalMetatypes(build('priority', { letters: 'EABCD' })).map(m => m.id)).toEqual([GLIM, STONE])
  expect(p.legalMetatypes(build('priority'))).toEqual([])
})

test('priority: a full magician is not legal at MAGIC E, mundane always is', () => {
  const p = setup('priority')
  expect(p.legalMagic(build('priority', { letters: 'ABEDC' }))).toEqual([{ kind: 'mundane', rating: 0 }])
  expect(p.legalMagic(build('priority', { letters: 'BCADE' }))).toEqual([
    { kind: 'full', rating: 4 }, { kind: 'mystic-adept', rating: 5 }, { kind: 'adept', rating: 7 }, { kind: 'technomancer', rating: 4 }, { kind: 'mundane', rating: 0 }])
})

// sum to ten
test('sum to ten: letters may repeat while their values add up to the target', () => {
  const p = setup('sumtoten'), letters = (s: string) => build('sumtoten', { letters: s }).priorities
  expect(p.id).toBe('sumtoten')
  expect(p.lettersValid(letters('ABCEE'))).toBe(true)  // 5+3+2+0+0 = 10
  expect(p.lettersValid(letters('AADEE'))).toBe(true)  // 11, the target
  expect(p.lettersValid(letters('AACEE'))).toBe(false) // 12
  expect(p.lettersValid(build('sumtoten').priorities)).toBe(false)
})

test('sum to ten: duplicate letters read the table like priority', () => {
  const p = setup('sumtoten'), b = build('sumtoten', { letters: 'AACEE', metatype: STONE, magic: 'full' })
  expect(p.attributePoints(b)).toBe(22)
  expect(p.adjustmentPoints(b)).toBe(11)
  expect(p.magicRating(b)).toBe(1)
  expect(p.nuyen(b)).toBe(8200)
})

test('sum to ten: with a letter value or the target unset the letters are invalid', () => {
  const letters = build('sumtoten', { letters: 'ABCEE' }).priorities
  expect(setup('sumtoten', { unset: ['letterValue:C'] }).lettersValid(letters)).toBe(false)
  expect(setup('sumtoten', { unset: ['sumToTenTarget'] }).lettersValid(letters)).toBe(false)
})

// point buy
test('point buy: starts with the free allotments and the character points', () => {
  const p = setup('pointbuy'), b = build('pointbuy', { metatype: GLIM })
  expect(p.lettersValid(b.priorities)).toBe(true)
  expect(p.characterPoints!(b)).toEqual({ max: 90, spent: 0, left: 90 })
  expect(p.attributePoints(b)).toBe(3)
  expect(p.skillPoints(b)).toBe(11)
  expect(p.adjustmentPoints(b)).toBe(1)
  expect(p.nuyen(b)).toBe(9000)
  expect(p.startingKarma()).toBe(40)
  expect(p.legalMetatypes(b).map(m => [m.id, m.adjustmentPoints])).toEqual([[GLIM, 1], [STONE, 1]])
})

test('point buy: prices each pool', () => {
  const p = setup('pointbuy'), b = build('pointbuy')
  Object.assign(b.cp, { attribute: 10, skill: 19, adjustment: 5, resources: 2, spells: 2, complexForms: 1 })
  expect(p.characterPoints!(b)).toEqual({ max: 90, spent: 30 + 19 + 15 + 2 + 6 + 3, left: 15 })
  expect(p.attributePoints(b)).toBe(13)
  expect(p.skillPoints(b)).toBe(30)
  expect(p.adjustmentPoints(b)).toBe(6)
  b.cp = { ...b.cp, attribute: 0, skill: 0, adjustment: 0, resources: 0, spells: 0, complexForms: 0, powerPoints: 2 }
  b.magic = 'adept'
  expect(p.characterPoints!(b).spent).toBe(9 + 10)
  b.magic = 'mystic-adept'
  expect(p.characterPoints!(b).spent).toBe(9 + 14)
})

test('point buy: being awakened costs character points; an aspected magician starts at its own rating', () => {
  const p = setup('pointbuy')
  expect(p.characterPoints!(build('pointbuy', { magic: 'aspected' })).spent).toBe(9)
  expect(p.magicRating(build('pointbuy', { magic: 'aspected' }))).toBe(3)
  expect(p.magicRating(build('pointbuy', { magic: 'technomancer' }))).toBe(1)
  expect(p.magicRating(build('pointbuy'))).toBe(0)
  const legal = p.legalMagic(build('pointbuy'))
  expect(legal).toContainEqual({ kind: 'aspected', rating: 3, cp: 9 })
  expect(legal).toContainEqual({ kind: 'mundane', rating: 0, cp: 0 })
  expect(legal).toHaveLength(6)
})

test('point buy: resource points buy nuyen; the metatype costs its karma', () => {
  const p = setup('pointbuy'), b = build('pointbuy', { metatype: STONE })
  b.cp.resources = 4
  expect(p.nuyen(b)).toBe(9000 + 4 * 15000)
  expect(p.characterPoints!(b).spent).toBe(4)
  expect(p.metatypeKarma!(b)).toBe(11)
  expect(p.metatypeKarma!(build('pointbuy'))).toBe(0)
})

test('point buy: an unset setting counts 0 for its pool', () => {
  const p = setup('pointbuy', { unset: ['pointBuy.free.attribute', 'pointBuy.total', 'pointBuy.cost.skill'] }), b = build('pointbuy')
  b.cp.attribute = 2; b.cp.skill = 4
  expect(p.attributePoints(b)).toBe(2)
  expect(p.characterPoints!(b)).toEqual({ max: 0, spent: 6, left: -6 })
})

// karma build
test('karma build: opens its own karma pool and no point pools', () => {
  const p = setup('karma'), b = build('karma', { metatype: GLIM })
  expect(p.startingKarma()).toBe(900)
  expect([p.attributePoints(b), p.skillPoints(b), p.adjustmentPoints(b), p.nuyen(b)]).toEqual([0, 0, 0, 0])
  expect(p.legalMetatypes(b).map(m => m.adjustmentPoints)).toEqual([0, 0])
})

test('karma build: charges the metatype and the magic kind; awakened start at the setting', () => {
  const p = setup('karma'), b = build('karma', { metatype: STONE, magic: 'full' })
  expect(p.metatypeKarma!(b)).toBe(11)
  expect(p.magicKarma!(b)).toBe(31)
  expect(p.magicRating(b)).toBe(1)
  expect(p.magicKarma!(build('karma'))).toBe(0)
  expect(p.magicRating(build('karma'))).toBe(0)
})

// lifepath
const OPEN = { attributePoints: 3, skillPoints: 4, adjustmentPoints: 1, nuyen: 1000, knowledge: 1 }
const take = (b: Sr6Build, ...ids: string[]) => { for (const id of ids) b.lifepath.push({ id, choices: {} }); return b }

test('lifepath: starts from the opening modules', () => {
  const p = setup('lifepath'), b = build('lifepath', { metatype: GLIM })
  expect(p.attributePoints(b)).toBe(OPEN.attributePoints)
  expect(p.skillPoints(b)).toBe(OPEN.skillPoints)
  expect(p.adjustmentPoints(b)).toBe(OPEN.adjustmentPoints)
  expect(p.nuyen(b)).toBe(OPEN.nuyen)
  expect(p.contactPoints!(b)).toEqual({ max: 0, spent: 0, left: 0, ratingCap: 7, karma: 0 })
  expect(p.knowledgePoints!(b)).toEqual({ max: 1, spent: 0, left: 1 })
})

test('lifepath: adds each picked module’s grants', () => {
  const p = setup('lifepath'), b = take(build('lifepath'), 'crb.street-sweeper', 'crb.wage-drone')
  expect(p.attributePoints(b)).toBe(OPEN.attributePoints + 1)
  expect(p.skillPoints(b)).toBe(OPEN.skillPoints + 3 + 5)
  expect(p.nuyen(b)).toBe(OPEN.nuyen + 7000)
})

test('lifepath: contact points come from the modules, capped by the setting, not Charisma', () => {
  const p = setup('lifepath'), b = take(build('lifepath'), 'crb.street-sweeper')
  b.attributes.cha.points = 4
  b.contacts.push({ uid: 'c1', name: 'Fixer', archetype: 'fixer', connection: 1, loyalty: 1 })
  expect(p.contactPoints!(b)).toEqual({ max: 3, spent: 2, left: 1, ratingCap: 7, karma: 0 })
})

test('lifepath: knowledge skills come from the modules, not Logic', () => {
  const p = setup('lifepath'), b = build('lifepath')
  b.attributes.log.points = 4
  b.knowledge.push({ uid: 'k1', name: 'Rooftops', kind: 'knowledge', points: 2, karma: 0 },
    { uid: 'k2', name: 'Cant', kind: 'language', native: true, points: 0, karma: 0 })
  expect(p.knowledgePoints!(b)).toEqual({ max: 1, spent: 2, left: -1 })
  take(b, 'crb.gutter-poet')
  expect(p.knowledgePoints!(b).max).toBe(4)
})

test('lifepath: available modules are the adult ones, marked when taken', () => {
  const p = setup('lifepath'), b = take(build('lifepath'), 'crb.dock-rat')
  const av = p.available!(b)
  expect(av.every(m => m.stage === 'adult')).toBe(true)
  expect(av.find(m => m.id === 'crb.dock-rat')?.taken).toBe(true)
  expect(av.find(m => m.id === 'crb.wage-drone')?.taken).toBe(false)
  expect(av.map(m => m.name)).toEqual([...av.map(m => m.name)].sort((x, y) => x.localeCompare(y)))
})

test('lifepath: offers awakened-only modules to a mundane or an emerged runner too, marked', () => {
  const p = setup('lifepath'), ids = (magic: MagicKind) => p.available!(build('lifepath', { magic })).filter(m => !m.fits).map(m => m.id)
  expect(ids('mundane')).toContain('crb.glow-apprentice')
  expect(ids('technomancer')).toContain('crb.glow-apprentice')
  expect(ids('full')).not.toContain('crb.glow-apprentice')
  expect(ids('adept')).not.toContain('crb.glow-apprentice')
  expect(p.available!(build('lifepath', { magic: 'mundane' })).filter(m => m.fits)).toHaveLength(8)
})

test('lifepath: a mixed choice counts only once picked, in the pool it lands in', () => {
  const p = setup('lifepath'), b = take(build('lifepath', { magic: 'full' }), 'crb.glow-apprentice')
  const base = { a: p.attributePoints(b), s: p.skillPoints(b), n: p.nuyen(b) }
  expect(base).toEqual({ a: OPEN.attributePoints, s: OPEN.skillPoints + 3, n: OPEN.nuyen })
  b.lifepath[0].choices = { 0: 'edg' }
  expect(p.attributePoints(b)).toBe(base.a + 1)
  b.lifepath[0].choices = { 0: 'skill:crb.hexing' }
  expect([p.attributePoints(b), p.skillPoints(b)]).toEqual([base.a, base.s + 1])
  b.lifepath[0].choices = { 0: 'nuyen:3000' }
  expect([p.skillPoints(b), p.nuyen(b)]).toEqual([base.s, base.n + 3000])
})

test('lifepath: magic starts at the setting for the kind; everyone is a legal metatype', () => {
  const p = setup('lifepath')
  expect(p.magicRating(build('lifepath', { magic: 'aspected' }))).toBe(3)
  expect(p.magicRating(build('lifepath'))).toBe(0)
  expect(p.legalMetatypes(build('lifepath')).map(m => m.id)).toEqual([GLIM, STONE])
  expect(p.legalMagic(build('lifepath'))).toContainEqual({ kind: 'full', rating: 1 })
})

test('lifepath: unknown picks and an unset contact cap count nothing', () => {
  const p = setup('lifepath', { unset: ['lifepath.contactRatingCap'] }), b = take(build('lifepath'), 'crb.gone')
  expect(p.skillPoints(b)).toBe(OPEN.skillPoints)
  expect(p.contactPoints!(b).ratingCap).toBe(0)
})

// the Sixth World Companion's lifepath rules (invented numbers: the fixture's raise 4, one module twice, 2 karma a rating)
test('lifepath: one module may be taken twice and counts twice; again only while the setting allows', () => {
  const p = setup('lifepath'), b = take(build('lifepath'), 'crb.wage-drone')
  expect(p.available!(b).find(m => m.id === 'crb.wage-drone')).toMatchObject({ taken: true, again: true })
  take(b, 'crb.wage-drone', 'crb.dock-rat')
  expect(p.skillPoints(b)).toBe(OPEN.skillPoints + 5 + 5 + 3)
  expect(p.available!(b).filter(m => m.again)).toEqual([])  // one module is doubled already
  expect(setup('lifepath', { unset: ['lifepath.repeatModules'] }).available!(take(build('lifepath'), 'crb.dock-rat'))
    .some(m => m.again)).toBe(false)
})

test('lifepath: the best attribute rises by the setting up to the metatype maximum, the rest goes on bestExtra', () => {
  const p = setup('lifepath'), b = build('lifepath', { metatype: GLIM })
  b.bestAttr = 'agi'  // Glimmerkin AGI 1–7: all 4
  expect([p.attributeBonus!(b, 'agi'), attrRating(b, 'agi', p)]).toEqual([4, 5])
  b.bestAttr = 'str'; b.bestExtra = 'log'  // STR 1–4: 3 of the 4, the other 1 on LOG
  expect([attrRating(b, 'str', p), attrRating(b, 'log', p), attrRating(b, 'agi', p)]).toEqual([4, 2, 1])
  expect(setup('lifepath', { unset: ['lifepath.bestAttributeBonus'] }).attributeBonus!(b, 'str')).toBe(0)
  expect(setup('priority').attributeBonus).toBeUndefined()
})

test('lifepath: contact points go to contacts of the module’s types; ratings past them cost karma each', () => {
  const { data, cr } = made({ data: d => {
    d.lifemodules['crb.street-sweeper'].contactTypes = ['street']  // 3 points
    d.lifemodules['crb.back-alley-medic'].contactTypes = ['medical']  // 1 point
  } })
  const p = makeProvider('lifepath', data, cr), b = take(build('lifepath'), 'crb.street-sweeper', 'crb.back-alley-medic')
  b.contacts.push({ uid: 'c1', name: 'Rat', archetype: 'Fence', connection: 2, loyalty: 2, types: ['street'] })
  expect(p.contactPoints!(b)).toEqual({ max: 4, spent: 3, left: 1, ratingCap: 7, karma: 2 })  // the medical point can't go there
  b.contacts.push({ uid: 'c2', name: 'Doc', archetype: 'Medic', connection: 1, loyalty: 1, types: ['medical'] })
  expect(p.contactPoints!(b)).toMatchObject({ spent: 4, left: 0, karma: 4 })
  b.contacts[0].types = ['street', 'medical']; b.contacts[1].types = ['street']
  expect(p.contactPoints!(b)).toMatchObject({ spent: 4, karma: 4 })
  expect(karmaBudget(b, data, cr, p).breakdown).toContainEqual(
    { key: 'contacts', label: 'Contact ratings past the contact points', amount: 4, sign: 'spend', tab: 'contacts' })
  // unset karma price: those ratings overspend the points instead
  cr.delete('lifepath.contactKarma')
  expect(makeProvider('lifepath', data, cr).contactPoints!(b)).toEqual({ max: 4, spent: 6, left: -2, ratingCap: 7 })
})

test('uncovered: the shortfall of a max flow from typed pools to typed contacts', () => {
  const pool = (points: number, ...types: string[]) => ({ points, ...(types.length ? { types } : {}) })
  const contact = (need: number, ...types: string[]) => ({ need, types })
  expect(uncovered([pool(4)], [contact(2, 'street'), contact(2)])).toBe(0)  // an any-type pool covers anyone
  expect(uncovered([pool(2, 'street'), pool(2, 'magic')], [contact(3, 'street')])).toBe(1)
  expect(uncovered([pool(2, 'street'), pool(2, 'magic')], [contact(3, 'street', 'magic'), contact(1, 'magic')])).toBe(0)
  expect(uncovered([pool(2, 'street', 'magic')], [contact(2, 'street'), contact(2, 'magic')])).toBe(2)
  expect(uncovered([], [contact(2)])).toBe(2)
})

test('lifepath: the metatype costs its karma', () => {
  const p = setup('lifepath')
  expect([p.metatypeKarma!(build('lifepath', { metatype: STONE })), p.metatypeKarma!(build('lifepath'))]).toEqual([11, 0])
})

// Born This Way (SWC p. 32; invented numbers): a raised metatype maximum starts higher, a mundane gains Edge
test('lifepath: an attribute with a raised metatype maximum starts at the setting; a mundane runner gains Edge', () => {
  const over = { rules: { 'lifepath.raisedAttributeStart': 3, 'lifepath.mundaneEdge': 2 } }
  const p = setup('lifepath', over), b = build('lifepath', { metatype: GLIM })  // Glimmerkin: AGI 7, CHA 8, the rest 6 or less
  expect((['bod', 'agi', 'cha', 'log', 'edg'] as const).map(k => attrRating(b, k, p))).toEqual([1, 3, 3, 1, 3])
  expect(attrRating(build('lifepath', { metatype: GLIM, magic: 'full' }), 'edg', p)).toBe(1)  // awakened: no Edge
  // the best attribute's raise stops at the maximum from where it starts
  b.bestAttr = 'agi'
  expect([p.attributeBonus!(b, 'agi'), attrRating(b, 'agi', p)]).toEqual([4, 7])
  // unset, nothing changes (and the other methods never)
  expect(attrRating(b, 'cha', setup('lifepath'))).toBe(1)
  expect(attrRating(build('priority', { letters: 'CABDE', metatype: GLIM }), 'agi', setup('priority', over))).toBe(1)
})

// metavariants under priority (the Sixth World Companion's development table; invented numbers)
test('priority: a metavariant is offered at the letters it has points for, at those points, and costs its karma', () => {
  const variant = { id: 'swc.dimling', name: 'Dimling', ranges: made().data.metatypes[GLIM].ranges, traits: [], page: 1, priority: { B: 10, C: 8 } }
  const over = { data: (d: ReturnType<typeof made>['data']) => { d.metatypes[variant.id] = variant }, rules: { 'metatypeKarma:swc.dimling': 5 } }
  const p = setup('priority', over)
  expect(p.legalMetatypes(build('priority', { letters: 'BACDE' })).map(m => [m.id, m.adjustmentPoints]))
    .toEqual([['swc.dimling', 10], [GLIM, 11], [STONE, 9]])
  expect(p.legalMetatypes(build('priority', { letters: 'ABCDE' })).map(m => m.id)).not.toContain('swc.dimling')
  const b = build('priority', { letters: 'CABDE', metatype: 'swc.dimling' })
  expect([p.adjustmentPoints(b), p.metatypeKarma!(b)]).toEqual([8, 5])
  expect(p.metatypeKarma!(build('priority', { letters: 'CABDE', metatype: GLIM }))).toBe(0)  // unset: none
})
