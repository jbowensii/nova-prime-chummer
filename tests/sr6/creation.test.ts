// The SR6 creation rules (src/sr6/engine/creation.ts): the numbers the book prints only in its text, entered by the GM in
// custom/sr6/creation.xml. Parsed from the made-up fixture (tests/fixtures/sr6/custom/creation.xml, invented values);
// a method lists the settings it still needs.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { CREATION_GROUPS, CREATION_KEYS, cite, expandKeys, flag, missingFor, num, parseCreation, rulesFrom, str, type CreationCatalog } from '../../src/sr6/engine/creation'
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

test('the fixture sets every key (grades: standard and alpha only; no initiative dice cap), typed, with its source and page', async () => {
  const { rules, errors } = parseCreation(XML)
  expect(errors).toEqual([])
  const keys = expandKeys(await shape()).map(k => k.key)
  expect(keys).toContain('metatypeKarma:crb.stonefolk')
  expect(keys).toContain('magicKarma:mystic-adept')
  expect(keys).not.toContain('magicKarma:mundane')
  for (const k of keys) expect(rules.has(k), k).toBe(!/^grade:(beta|delta|used):/.test(k) && !['advance.nuyenToKarmaRate', 'initiativeDiceMax'].includes(k))
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
    expect(['number', 'bool', 'quality']).toContain(k.type)
    expect(k.key).toMatch(/^[A-Za-z0-9.:_-]{1,80}$/)
  }
})

test('the Advancement group (career prices and caps) follows Karma prices; every key is optional', async () => {
  const adv = CREATION_KEYS.filter(k => k.group === 'Advancement')
  expect(adv.map(k => k.key)).toEqual(['advance.expertise', 'advance.qualityFactor', 'advance.buyOffFactor', 'advance.skillMax',
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
