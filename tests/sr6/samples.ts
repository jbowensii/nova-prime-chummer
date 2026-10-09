// The Foundry module's samples (chummer-sr6-foundry samples/test-*.json), all made up: the fixture catalog plus three
// invented books (MUS, every kind; MUX, only what Eden doesn't use; MUR, the runner's other things), a finalized mystic
// adept, a grunt and a GM compendium. tests/sr6/export.test.ts exports them; WRITE_SR6_SAMPLES=<dir> writes the files.
import { blankBuild, type Sr6Character } from '../../src/sr6/model/character'
import type { Sr6Compendium, Sr6Entry, Sr6Kind, Sr6Part } from '../../src/sr6/model/types'
import { sr6Data } from '../../src/sr6/engine/data'
import { makeProvider } from '../../src/sr6/engine/providers'
import { npcFromEntry } from '../../src/sr6/engine/npc'
import { fixtureCatalog, fixtureCreation } from './fixture'

export const SAMPLE_OPTS = { descriptions: true, now: '2026-10-04T09:00:00.000Z', appVersion: '0.9.0' }
/** 1×1 pictures, so a Foundry upload of them works */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGPQ0NAAAAD0AHmj6usRAAAAAElFTkSuQmCC'
const JPEG = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDk6KKKAP/Z'

const en = (source: string, kind: Sr6Kind, id: string, name: string, attrs: Record<string, string> = {},
  parts: Record<string, string> = {}, text = ''): Sr6Entry =>
  ({ id, kind, name, source, page: 10, attrs, parts: Object.entries(parts).map(([tag, t]) => ({ tag, attrs: {}, text: t })), text })
const mus = (kind: Sr6Kind, id: string, name: string, attrs?: Record<string, string>, parts?: Record<string, string>, text?: string) =>
  en('MUS', kind, `mus.${id}`, name, attrs, parts, text)
/** a catalog <effect> (low: read from a conditional sentence) and a <test> */
const fx = (target: string, value: string, low = false): Sr6Part => ({ tag: 'effect', attrs: { target, op: 'add', value, ...(low ? { confidence: 'low' } : {}) }, text: '' })
const test = (skill: string, attr: string, threshold: string): Sr6Part => ({ tag: 'test', attrs: { skill, attr, threshold }, text: '' })
const withParts = (e: Sr6Entry, ...parts: Sr6Part[]): Sr6Entry => ({ ...e, parts: [...e.parts, ...parts] })
const mur = (kind: Sr6Kind, id: string, name: string, attrs?: Record<string, string>) => en('MUR', kind, `mur.${id}`, name, attrs)

const GANGER = mus('npcs', 'ganger', 'Made-up Ganger', { rating: '3', group: 'Made-up Crew', bod: '4', agi: '3', rea: '3', str: '4', wil: '2',
  log: '2', int: '3', cha: '2', edg: '1', init: '6 + 1D6', dr: '2D6' },
  { skills: 'Firearms 4, Close Combat 3, Basket Weaving 2', weapons: 'Made-up Zapper [Pistol, DV 2S]' })

const ENTRIES: Sr6Entry[] = [
  mus('priorities', 'prio-a', 'A', { letter: 'A' }, { resources: '' }),
  mus('metatypes', 'elf', 'Elf'),
  mus('skills', 'basket-weaving', 'Underwater Basket Weaving', { attr: 'log', untrained: 'false' }),
  withParts(mus('qualities', 'lucky-break', 'Lucky Break', { kind: 'positive', karma: '4', karmaMax: '8' }, {}, 'Made-up luck.'),
    fx('attr:agi', '1'), fx('skill:firearms', '2', true), fx('derived:defense', '1'), test('skill:perception', 'attr:int', '3')),
  mus('weapons', 'pocket-zapper', 'Pocket Zapper', { category: 'Pocket Tasers', dv: '3S(e)', ar: '9/7/—/—/—', modes: 'SA', ammo: '4(m)', avail: '2(L)', cost: '150' }, {}, 'A made-up zapper.'),
  mus('weapons', 'glitter-cannon', 'Glitter Cannon', { category: 'Glitter cannons', dv: '—', cost: 'ask your fixer' }),
  mus('armor', 'test-jacket', 'Test Jacket', { category: 'Body armor', defense: '3', cost: '500' }),
  mus('augmentations', 'reflex-booster', 'Made-up Reflex Booster', { type: 'cyberware', category: 'Bodyware', rating: '1-3', essence: 'Rating × 0.1', avail: '4(I)', cost: 'Rating × 1000' }),
  mus('electronics', 'test-link', 'Test Link', { category: 'Commlinks', rating: '3', array: '1/1', avail: '2', cost: '700' }),
  mus('electronics', 'test-deck', 'Test Deck', { category: 'Cyberdecks', rating: '2', array: '5 4', programs: '2', avail: '4', cost: '5000' }),
  mus('programs', 'made-up-sniffer', 'Made-up Sniffer', { type: 'hacking', avail: '4(I)', cost: '250' }, {}, 'An invented program.'),
  mus('gear', 'made-up-spoiler', 'Made-up Spoiler', { category: 'Vehicle mods', slots: '2', cost: '300' }),
  mus('martialarts', 'made-up-fist', 'Made-up Fist', { categories: 'Striking, Grappling', signature: 'Made-up Sweep' }, {}, 'An invented style.'),
  mus('martialtechniques', 'made-up-sweep', 'Made-up Sweep', { category: 'Striking' }, {}, 'An invented technique.'),
  mus('traditions', 'made-up-path', 'Made-up Path', {}, {}, 'An invented tradition.'),
  mus('critterpowers', 'made-up-allergy', 'Made-up Allergy', { type: 'P', weakness: 'true' }),
  withParts(mus('gear', 'made-up-sight', 'Made-up Sight', { category: 'Weapon accessories', accessoryOf: 'mus.pocket-zapper', avail: '2', cost: '200' }),
    fx('item:ar', '0,1,1,0,0')),
  mus('gear', 'rope', 'Glitter Rope', { category: 'Survival gear', cost: '50' }),
  mus('vehicles', 'test-drone', 'Test Drone', { category: 'Small drones (air)', handling: '3', topSpeed: '60', body: '2', cost: '3000' }),
  mus('spells', 'zap-bolt', 'Zap Bolt', { category: 'combat', tags: 'Direct', range: 'LOS', type: 'M', duration: 'I', dv: '3', damage: 'P' }),
  mus('rituals', 'test-ward', 'Test Ward', { keywords: 'Anchored, Spell', threshold: '4' }),
  mus('adeptpowers', 'quick-step', 'Quick Step', { cost: '0.5', perLevel: 'true', activation: 'Minor action' }),
  mus('complexforms', 'made-up-pulse', 'Made-up Pulse', { duration: 'S', fade: '3' }),
  mus('metamagics', 'made-up-centering', 'Made-up Centering'),
  mus('echoes', 'made-up-echo', 'Made-up Echo'),
  mus('critterpowers', 'made-up-glow', 'Made-up Glow', { type: 'M', action: 'Minor', range: 'LOS', duration: 'S' }),
  mus('critters', 'fake-hound', 'Fake Hound', { category: 'Made-up beasts', bod: '5', agi: '4', rea: '4', str: '5', wil: '3', log: '1', int: '4', cha: '2', edg: '1' },
    { skills: 'Close Combat 4', powers: 'Made-up Glow, Fake Bite', weaknesses: 'Allergy (made-up dust)' }),
  mus('spirits', 'spirit-of-man', 'Spirit of Man', { bod: 'F', agi: 'F+1', rea: 'F', str: 'F-1' }, { powers: 'Made-up Glow' }),
  GANGER,
  mus('sprites', 'fault-sprite', 'Fault Sprite', { attack: 'L', sleaze: 'L+1', data: 'L', firewall: 'L+2', res: 'L' }, { powers: 'Made-up Static' }),
  mus('lifestyles', 'made-up-squat', 'Made-up Hideout', { cost: '450' }),
  mus('contacts', 'fake-fixer', 'Fake Fixer', { connection: '4', loyalty: '2', archetype: 'Fixer' }),
  mus('lifemodules', 'made-up-childhood', 'Made-up Childhood', { stage: 'opening' }),
  mus('rules', 'rule-intro', 'Made-up Basics', { chapter: 'Made-up Rules', level: '1' }, {}, 'Invented rules text.'),
  mus('rules', 'rule-detail', 'Made-up Detail', { chapter: 'Made-up Rules', level: '2', parent: 'mus.rule-intro' }),
  en('MUX', 'priorities', 'mux.prio-b', 'B', { letter: 'B' }),
  en('MUX', 'metatypes', 'mux.troll', 'Troll'),
  mur('metatypes', 'human', 'Human'),
  mur('skills', 'firearms', 'Firearms', { attr: 'agi', untrained: 'true' }),
  mur('skills', 'close-combat', 'Close Combat', { attr: 'agi', untrained: 'true' }),
  mur('skills', 'sorcery', 'Sorcery', { attr: 'mag', untrained: 'false' }),
  mur('qualities', 'night-eyes', 'Night Eyes', { kind: 'positive', karma: '0' }),
  mur('qualities', 'made-up-tough', 'Made-up Tough', { kind: 'positive', karma: '4', perLevel: 'true', maxLevel: '3' }),
  mur('qualities', 'made-up-debt', 'Made-up Debt', { kind: 'negative', karma: '2', perLevel: 'true', maxLevel: '3' }),
  mur('spells', 'glimmer', 'Glimmer', { category: 'illusion', range: 'LOS(A)', type: 'P', duration: 'S' }),
  mur('weapons', 'odd-blade', 'Odd Blade', { category: 'Blades', dv: 'STR+?', ar: '6/—/—/—/—', avail: '1', cost: '80' }),
  mur('augmentations', 'booster-port', 'Booster Port', { type: 'cyberware', category: 'Bodyware', capacity: '[1]', cost: '100' }),
  mur('gear', 'power-focus', 'Made-up Power Focus', { category: 'Foci', rating: '1-6', cost: 'Rating × 4000' }),
  mur('vehicles', 'test-bike', 'Test Bike', { category: 'Bikes', handling: '4/3', accel: '10/15', interval: '20', topSpeed: '120', body: '5', armor: '4',
    pilot: '1', sensor: '1', seats: '1', cost: '5000' }),
]

/** The samples' catalog, data and creation rules (the fixture's, with a used grade and the dice the samples show). */
export function sampleWorld() {
  const c = fixtureCatalog()
  for (const [id, name, canon] of [['MUS', 'Made-Up Streets', true], ['MUX', 'Made-Up Extras', false], ['MUR', 'Made-Up Runners', true]] as const)
    c.sources.set(id, { id, name, publisher: 'Nobody', canon, origin: 'imported' })
  for (const e of ENTRIES) c.entries[e.kind].set(e.id, e)
  const data = sr6Data(c), cr = fixtureCreation()
  for (const [key, value] of Object.entries({ essence: 6, initiativeDice: 1, astralInitiativeDice: 2, 'grade:used:cost': 1.2, 'grade:used:essence': 1.2, 'grade:used:avail': 0, builtToughQuality: 'mur.made-up-tough' }))
    cr.set(key, { key, value })
  return { c, data, cr }
}

/** Made-Up Mara, a finalized mystic adept with one of every kind of thing. */
export function mara(w: ReturnType<typeof sampleWorld>): Sr6Character {
  const b = blankBuild('karma')
  Object.assign(b, { metatype: 'mus.elf', magic: 'mystic-adept', tradition: 'Made-up Hermetic', drainAttr: 'log', initiation: 1, powerPointsBought: 1 })
  for (const [k, n] of Object.entries({ bod: 3, agi: 5, rea: 4, str: 2, wil: 3, log: 5, int: 4, cha: 3, edg: 3 })) b.attributes[k as 'bod'].karma = n - 1
  b.attributes.mag.karma = 6 - makeProvider(b.method, w.data, w.cr).magicRating(b) // Magic 6, less 1 for the ware's Essence: 5
  b.skills = [{ id: 'mur.firearms', points: 4, karma: 0, spec: 'Pistols (Light)' },
    { id: 'mur.sorcery', points: 5, karma: 0, spec: 'Made-up Spellshaping', expertise: 'Spellcasting' },
    { id: 'mur.close-combat', points: 2, karma: 0 }, { id: 'mus.basket-weaving', points: 1, karma: 0 }]
  b.knowledge = [{ uid: 'kn1', name: 'Made-up Gang Lore', kind: 'knowledge', points: 2, karma: 0 },
    { uid: 'kn2', name: 'Testlandic', kind: 'language', native: true, points: 0, karma: 0 },
    { uid: 'kn3', name: 'Fakespeak', kind: 'language', points: 1, karma: 0 }]
  b.qualities = [{ uid: 'q1', id: 'mus.lucky-break', level: 1 }, { uid: 'q2', id: 'mur.night-eyes', level: 1, free: true },
    { uid: 'q3', id: 'mur.made-up-debt', level: 2, note: 'Owes a made-up fixer.' }, { uid: 'q4', id: 'mur.made-up-tough', level: 1 }]
  b.picks = [{ uid: 'p1', kind: 'spells', id: 'mus.zap-bolt' }, { uid: 'p2', kind: 'spells', id: 'mur.glimmer' },
    { uid: 'p3', kind: 'rituals', id: 'mus.test-ward' }, { uid: 'p4', kind: 'adeptpowers', id: 'mus.quick-step', level: 2, bonuses: [{ target: 'initDice', value: 1 }] },
    { uid: 'p5', kind: 'metamagics', id: 'mus.made-up-centering' }]
  b.purchases = [
    { uid: 'w1', kind: 'weapons', id: 'mus.pocket-zapper', qty: 1, accessories: [{ uid: 'w1a', kind: 'gear', id: 'mus.made-up-sight', qty: 1, accessories: [] }] },
    { uid: 'w2', kind: 'weapons', id: 'mur.odd-blade', qty: 1, note: 'Made-up engraving.', accessories: [] },
    { uid: 'a1', kind: 'armor', id: 'mus.test-jacket', qty: 1, worn: true, accessories: [] },
    { uid: 'c1', kind: 'augmentations', id: 'mus.reflex-booster', rating: 1, grade: 'used', qty: 1,
      bonuses: [{ target: 'rea', value: 1 }, { target: 'initDice', value: 1 }, { target: 'defense', value: 1 }],
      accessories: [{ uid: 'c1a', kind: 'augmentations', id: 'mur.booster-port', qty: 1, accessories: [] }] },
    { uid: 'e1', kind: 'electronics', id: 'mus.test-link', qty: 1, accessories: [] },
    { uid: 'e2', kind: 'electronics', id: 'mus.test-deck', qty: 1, accessories: [{ uid: 'e2a', kind: 'programs', id: 'mus.made-up-sniffer', qty: 1, accessories: [] }] },
    { uid: 'g1', kind: 'gear', id: 'mur.power-focus', rating: 2, qty: 1, worn: true, accessories: [] },
    { uid: 'g2', kind: 'gear', id: 'mus.rope', qty: 3, accessories: [] },
    { uid: 'v1', kind: 'vehicles', id: 'mur.test-bike', qty: 1, accessories: [] },
    { uid: 'x1', kind: 'gear', name: 'Lucky Coin', cost: 5, qty: 1, accessories: [] },
  ]
  b.contacts = [{ uid: 'k1', name: 'Fake Fixer', archetype: 'Fixer', connection: 4, loyalty: 2, types: ['street'] }]
  b.lifestyle = { id: 'mus.made-up-squat', months: 2 }
  b.sins = [{ uid: 's1', name: 'Mara Testcase', kind: 'fake', rating: 3, licences: [{ name: 'Made-up Permit', rating: 3 }] },
    { uid: 's2', name: 'Birth Record', kind: 'real', licences: [] }]
  return { formatVersion: 1, id: 'run-mara-1', build: b, overrides: [], updatedAt: '2026-10-03T20:00:00.000Z', finalizedAt: '2026-10-01T10:00:00.000Z',
    identity: { name: 'Mara Testcase', streetName: 'Made-Up Mara', metatype: 'mus.elf', portrait: PNG,
      background: 'An invented runner for the tests.\n\nShe exists only here.', notes: 'Made-up notes & <stuff>.' },
    ledger: [{ id: 'l1', at: '2026-10-01T10:00:00.000Z', type: 'finalize', karma: 7, nuyen: 1234 },
      { id: 'l2', at: '2026-10-02T10:00:00.000Z', type: 'note', text: 'Made-up debrief.' }] }
}

/** A grunt copied from MUS's Made-up Ganger. */
export function ganger(id = 'npc-grunt-1', streetName = 'Made-up Ganger'): Sr6Character {
  const ch = npcFromEntry(GANGER, undefined, SAMPLE_OPTS.now)
  ch.id = id
  ch.build.metatype = ch.identity.metatype = 'mur.human'
  Object.assign(ch.identity, { streetName, background: 'Invented for the tests.' })
  return ch
}

/** Gil Made-up's compendium Street Kit: a weapon and a spirit of its own, and a grunt with a token. */
export function streetKit(): Sr6Compendium {
  const tough = ganger('street-npc-1', 'Street Tough')
  tough.identity.token = JPEG
  return { id: 'a1b2c3d4e5f6', name: 'Street Kit', source: 'STREET', sharing: 'private', updatedAt: SAMPLE_OPTS.now, owner: 'gil', ownerName: 'Gil Made-up',
    entries: [en('STREET', 'weapons', 'street.zapper', 'Zapper', { category: 'Zappers', dv: '2S' }, {}, 'Made-up.'),
      en('STREET', 'spirits', 'street.alley-spirit', 'Alley Spirit', {}, {}, 'Made-up.')].map(e => ({ ...e, page: 1 })),
    npcs: [tough] }
}
