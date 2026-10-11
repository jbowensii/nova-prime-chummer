// The SR6 creation rules (src/sr6/engine/creation.ts): the numbers the book prints only in its text, entered by the GM in
// custom/sr6/creation.xml. Parsed from the made-up fixture (tests/fixtures/sr6/custom/creation.xml, invented values);
// a method lists the settings it still needs. The shipped standard settings (public/data/sr6/creation-defaults.xml) are
// only checked for shape here: valid, and enough to pick each method.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { CREATION_GROUPS, CREATION_KEYS, cite, expandKeys, flag, loadCreation, missingFor, num, parseCreation, readSettingsFile, rulesFrom, str, type CreationCatalog } from '../../src/sr6/engine/creation'
import { buildSr6Catalog, collectSr6Files } from '../../src/sr6/engine/load'

const FIXTURE = 'tests/fixtures/sr6/custom'
const XML = readFileSync(join(FIXTURE, 'creation.xml'), 'utf8')
const get = async (path: string) => {
  const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join(FIXTURE, path.slice(11)) : null
  try { return file ? readFileSync(file, 'utf8') : null } catch { return null }
}
/** The fixture catalog in the shape missingFor reads (Task 4's Sr6Data has it). */
async function shape(): Promise<CreationCatalog> {
  const c = buildSr6Catalog((await collectSr6Files(get)).files)
  return {
    priorities: Object.fromEntries([...c.entries.priorities.values()].map(e => [e.attrs.letter, e])),
    metatypes: Object.fromEntries(c.entries.metatypes),
    lifemodules: Object.fromEntries([...c.entries.lifemodules.values()].map(e => [e.id, { stage: e.attrs.stage }])),
  }
}
const without = (key: string) => XML.replace(new RegExp(`\\s*<setting key="${key.replace(/[.]/g, '\\.')}"[^>]*/>`), '')

/** the settings the fixture leaves unset (each test sets its own) */
const UNSET = ['advance.nuyenToKarmaRate', 'initiativeDiceMax', 'contactKarma', 'contactPairPerCha', 'contactRatingMax',
  'attributeAugmentMax', 'skillAugmentMax', 'monitorMinimum', 'matrixColdDice', 'matrixHotDice', 'moveWalk', 'moveSprint', 'moveSprintPerHit',
  'unarmedDV', 'arDrEdgeGap', 'meleeArStrength', 'stackingAdvantage', 'strengthInCloseCombat', 'highStrengthDamage', 'strengthDamageStep1', 'strengthDamageStep2',
  'levelStreet', 'levelPrime', 'levelSwcStreet', 'levelSwcElite', 'priorityLetters', 'swcStreet.sumToTen', 'swcStreet.pointBuy', 'swcStreet.modules', 'swcStreet.letters',
  'swcElite.sumToTen', 'swcElite.pointBuy', 'swcElite.modules', 'swcElite.letters', 'swcStreet.karmaBuild', 'swcElite.karmaBuild',
  'incompetentQuality', 'sensitiveSystemQuality', 'sensitiveSystemEssence', 'attributeMaxFloor', 'improvedAbilityPower', 'improvedAbilityFactor', 'suprathyroidStacks',
  'expandedSpecializations', 'unrestrictedSkillRanks', 'languageMax', 'fociForcePerMagic', 'fociBondKarma',
  'alternateMysticAdept', 'twentyQuestions', 'twentyQuestionsKarma', 'workingForThePeople',
  // the owner's house rules and options (2026-10-11), and the values a GM sets under them
  'mentorSpiritQuality', 'ownCarryOver', 'carryOver.karma', 'carryOver.nuyen', 'dataStructureNuyen', 'exoticFirstSpecFree', 'mentorBothAdvantages',
  'dataStructureCaps', 'dataStructure.maxCount', 'dataStructure.maxRating', 'noUsedCulturedBioware', 'gradeCapAtCreation', 'gradeCap.initiation',
  'gradeCap.submersion', 'adjustOnLoweredMax', 'pointBuyErrataNuyen', 'knowledgeLogicIntuition', 'magicAboveSixByGrade', 'eliteSumToThirteen',
  'availabilitySeven', 'cargoWithoutSeats', 'metatypeSizePricing']
test('the fixture sets every key (grades: standard and alpha only; no initiative dice cap), typed, with its source and page', async () => {
  const { rules, errors } = parseCreation(XML)
  expect(errors).toEqual([])
  const keys = expandKeys(await shape()).map(k => k.key)
  expect(keys).toContain('metatypeKarma:crb.stonefolk')
  expect(keys).toContain('magicKarma:mystic-adept')
  expect(keys).not.toContain('magicKarma:mundane')
  for (const k of keys) expect(rules.has(k), k).toBe(!/^grade:(beta|delta|used):/.test(k) && !UNSET.includes(k))
  expect(num(rules, 'startingKarma')).toBe(40)
  expect(num(rules, 'grade:alpha:essence')).toBe(0.7)
  expect(flag(rules, 'oneAttributeAtMax')).toBe(true)
  expect(str(rules, 'aptitudeQuality')).toBe('crb.knack')
  expect(num(rules, 'aptitudeQuality')).toBeUndefined()
  expect(cite(rules, 'skillCap')).toEqual({ source: 'CRB', page: 61 })
  expect(num(rules, 'grade:beta:essence')).toBeUndefined()
})

test('a value that isn’t of its key’s type is an error naming the key, and the setting is skipped', () => {
  const { rules, errors } = parseCreation(XML.replace('key="skillCap" value="5"', 'key="skillCap" value="x"')
    .replace('key="oneAttributeAtMax" value="true"', 'key="oneAttributeAtMax" value="yes"'))
  expect(errors).toHaveLength(2)
  expect(errors[1]).toContain('skillCap')
  expect(errors[0]).toContain('oneAttributeAtMax')
  expect(rules.has('skillCap')).toBe(false)
  expect(rules.has('startingKarma')).toBe(true)
})

test('an unknown key is an error; another document gives no rules', () => {
  expect(parseCreation(XML.replace('</sr6:creation>', '<setting key="nope" value="1"/></sr6:creation>')).errors).toEqual([expect.stringContaining('nope')])
  expect(parseCreation('<tablerules/>')).toEqual({ rules: new Map(), errors: [expect.any(String)] })
  expect(parseCreation('<x').rules.size).toBe(0)
})

test('missingFor lists the method’s unset settings and the catalog it lacks', async () => {
  const data = await shape()
  for (const m of ['priority', 'sumtoten', 'pointbuy', 'karma', 'lifepath'] as const) expect(missingFor(m, parseCreation(XML).rules, data), m).toEqual([])
  expect(missingFor('pointbuy', parseCreation(without('pointBuy.total')).rules, data)).toEqual(['pointBuy.total'])
  expect(missingFor('priority', parseCreation(without('pointBuy.total')).rules, data)).toEqual([])
  expect(missingFor('karma', parseCreation(without('startingKarma')).rules, data)).toEqual(['startingKarma'])
  // not printed in the core rulebook: optional (unset, no limit)
  const unprinted = parseCreation(XML).rules
  unprinted.delete('karmaToNuyenMax'); unprinted.delete('maxKarmaLeft')
  for (const m of ['priority', 'sumtoten', 'pointbuy', 'karma', 'lifepath'] as const) expect(missingFor(m, unprinted, data), m).toEqual([])
  expect(missingFor('lifepath', parseCreation(XML).rules, { ...data, lifemodules: {} })).toEqual(['life modules'])
  const { D: _, ...noD } = data.priorities
  expect(missingFor('sumtoten', parseCreation(XML).rules, { ...data, priorities: noD })).toEqual(['priorities A–E'])
  expect(missingFor('pointbuy', new Map(), data)).toContain('metatypeKarma:crb.glimmerkin')
})

test('every key has a label of its own (Game data’s input names), a known type and group, and appears once', async () => {
  expect(new Set(CREATION_KEYS.map(k => k.key)).size).toBe(CREATION_KEYS.length)
  const all = expandKeys(await shape())
  expect(new Set(all.map(k => k.label)).size).toBe(all.length)
  for (const k of all) expect(CREATION_GROUPS).toContain(k.group)
  for (const k of CREATION_KEYS) {
    expect(k.label, k.key).toBeTruthy()
    expect(['number', 'bool', 'quality', 'letters']).toContain(k.type)
    expect(k.key).toMatch(/^[A-Za-z0-9.:_-]{1,80}$/)
  }
})

test('the Advancement group (career prices and caps) follows Karma prices; every key is optional', async () => {
  const adv = CREATION_KEYS.filter(k => k.group === 'Advancement')
  expect(adv.map(k => k.key)).toEqual(['buyPowerPoints', 'advance.expertise', 'advance.expertiseRank', 'advance.qualityFactor', 'advance.buyOffFactor', 'advance.skillMax',
    'advance.powerPoint', 'advance.karmaToNuyenRate', 'advance.nuyenToKarmaRate'])
  expect(CREATION_GROUPS.indexOf('Advancement')).toBe(CREATION_GROUPS.indexOf('Karma prices') + 1)
  for (const k of adv) expect(k.methods, k.key).toEqual([])
  const { rules } = parseCreation(XML)
  expect(num(rules, 'advance.skillMax')).toBe(11)
  expect(num(rules, 'advance.karmaToNuyenRate')).toBe(1100)
  expect(rules.has('advance.nuyenToKarmaRate')).toBe(false)
  const data = await shape()
  for (const m of ['priority', 'sumtoten', 'pointbuy', 'karma', 'lifepath'] as const)
    for (const k of adv) expect(missingFor(m, new Map(), data), m).not.toContain(k.key)
  expect(missingFor('priority', parseCreation(XML.replace(/\s*<setting key="advance\.[^"]*"[^>]*\/>/g, '')).rules, data)).toEqual([])
})

test('a campaign’s stored rows read like a file’s: typed, with source and page; a bad row is an error and is skipped', () => {
  const { rules, errors } = rulesFrom([{ key: 'startingKarma', value: '55', source: 'HOUSE', page: 3 }, { key: 'oneAttributeAtMax', value: 'false' },
    { key: 'skillCap', value: 'lots' }, { key: 'noSuchSetting', value: '1' }, { key: 'metatypeKarma:x.made-up', value: '7', page: '12' }])
  expect(rules.get('startingKarma')).toEqual({ key: 'startingKarma', value: 55, source: 'HOUSE', page: 3 })
  expect(flag(rules, 'oneAttributeAtMax')).toBe(false)
  expect(num(rules, 'metatypeKarma:x.made-up')).toBe(7)
  expect(cite(rules, 'metatypeKarma:x.made-up')).toEqual({ page: 12 })
  expect(rules.has('skillCap')).toBe(false)
  expect(errors).toEqual(['skillCap: “lots” isn’t a number.', '“noSuchSetting” isn’t a creation setting.'])
})

test('a settings file to load: its rows typed and checked as the server would; a file of another kind loads nothing', () => {
  const file = (rows: string) => `<?xml version="1.0"?><sr6:creation xmlns:sr6="urn:chummer-sr6:config:1" version="1">${rows}</sr6:creation>`
  const r = readSettingsFile(file(`<setting key="startingKarma" value="66" source="HOUSE" page="9"/><setting key="startingKarma" value="1"/>
    <setting key="skillCap" value="4" source="house" page="0"/><setting key="aptitudeQuality" value="x.made-up"/>
    <setting key="nope" value="1"/><setting key="essence" value="${'9'.repeat(201)}"/>`), 'mine.xml')
  expect(r.fatal).toBeUndefined()
  expect([...r.rules.values()]).toEqual([{ key: 'startingKarma', value: 66, source: 'HOUSE', page: 9 }, { key: 'skillCap', value: 4 },
    { key: 'aptitudeQuality', value: 'x.made-up' }])
  expect(r.errors).toEqual(['startingKarma is set twice: the first one is kept.', 'skillCap: the source “house” isn’t a book id such as CRB; left out.',
    'skillCap: the page “0” isn’t a whole number from 1; left out.', 'essence: the value is longer than 200 characters.', '“nope” isn’t a creation setting.'])
  for (const bad of ['<tablerules/>', 'not xml at all', '<creation version="1"/>'])
    expect(readSettingsFile(bad, 'x.xml')).toMatchObject({ fatal: expect.stringContaining('x.xml isn’t a creation rules file'), rules: new Map() })
  expect(readSettingsFile(file('<setting key="k" value="1"/>'.repeat(501)), 'big.xml').fatal).toBe('big.xml has 501 settings; 500 at most.')
})

test('the shipped standard settings are valid against creation.xsd, parse cleanly, and unlock every method a book prints', async () => {
  const xml = readFileSync('public/data/sr6/creation-defaults.xml', 'utf8')
  const xsd = readFileSync('public/data/sr6/schema/creation.xsd', 'utf8')
  expect((await validateXML({ xml: { fileName: 'creation-defaults.xml', contents: xml }, schema: { fileName: 'creation.xsd', contents: xsd } })).errors).toEqual([])
  const { rules, errors } = parseCreation(xml)
  expect(errors).toEqual([])
  // a catalog with the core rulebook's metatype ids, every priority row and an opening life module (no book data)
  const ids = ['human', 'elf', 'dwarf', 'ork', 'troll'].map(m => `crb.${m}`)
  const cat: CreationCatalog = { priorities: { A: {}, B: {}, C: {}, D: {}, E: {} },
    metatypes: Object.fromEntries(ids.map(id => [id, { id, name: id }])), lifemodules: { 'x.start': { stage: 'opening' } } }
  for (const m of ['priority', 'sumtoten', 'pointbuy', 'lifepath'] as const) expect(missingFor(m, rules, cat), m).toEqual([])
  // no SR6 book describes a karma build: an option, off, whose numbers ship set (Commlink6's defaults)
  expect(missingFor('karma', rules, cat)).toEqual(['karmaBuildMethod'])
  expect(flag(rules, 'karmaBuildMethod')).toBe(false)
})

test('the server’s settings: the standard ones overlaid by the admin’s changes, key by key; none saved: the standard', async () => {
  const doc = (rows: string) => `<sr6:creation xmlns:sr6="urn:chummer-sr6:config:1" version="1">${rows}</sr6:creation>`
  const files: Record<string, string> = { './data/sr6/creation-defaults.xml': doc('<setting key="skillCap" value="4" source="CRB" page="9"/><setting key="essence" value="3"/>'),
    './custom/sr6/creation.xml': doc('<setting key="skillCap" value="8"/><setting key="maxKarmaLeft" value="2"/>') }
  const answer = (url: string) => files[url] ? new Response(files[url], { headers: { 'Content-Type': 'application/xml' } }) : new Response('', { status: 404 })
  vi.stubGlobal('fetch', async (url: string) => answer(url))
  try {
    const { rules, std, errors } = await loadCreation()
    expect(errors).toEqual([])
    expect([num(rules, 'skillCap'), num(rules, 'essence'), num(rules, 'maxKarmaLeft')]).toEqual([8, 3, 2])
    expect(cite(rules, 'skillCap')).toEqual({}) // the admin's row, not the standard's citation
    expect(num(std, 'skillCap')).toBe(4)
    delete files['./custom/sr6/creation.xml']
    expect(num((await loadCreation()).rules, 'skillCap')).toBe(4)
  } finally { vi.unstubAllGlobals() }
})
