// The optional data set (custom/sr6/cl6only/, written by `python -m tools.cl6check module`): the catalog loads it only
// while the server's cl6OnlyData setting is on (off by default), after the books, its entries under sources of their own
// marked not canon. Made-up files throughout.
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { buildSr6Catalog, collectSr6Files } from '../../../src/sr6/catalog/domain/load'
import { CL6_ONLY_KEY, CREATION_KEYS, flag, parseCreation } from '../../../src/sr6/table-setup/domain/creation'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const FILES: Record<string, string> = {
  'data/sr6/sources.xml': `<sr6:data ${NS} kind="sources" version="1"><source id="ZZ" publisher="P" canon="true"><name>Zed Book</name></source></sr6:data>`,
  'custom/sr6/imported/index.xml': '<overlays><file href="zz/gear.xml"/></overlays>',
  'custom/sr6/imported/zz/gear.xml': `<sr6:data ${NS} kind="gear" version="1"><gear id="zz.lamp" source="ZZ" page="3" category="Tools"><name>Lamp</name></gear></sr6:data>`,
  'custom/sr6/cl6only/index.xml': '<overlays><file href="sources.xml"/><file href="gear.xml"/></overlays>',
  'custom/sr6/cl6only/sources.xml': `<sr6:data ${NS} kind="sources" version="1"><source id="CL6-ZZ" publisher="CommLink6" canon="false"><name>CommLink6 only: Zed Book</name></source></sr6:data>`,
  'custom/sr6/cl6only/gear.xml': `<sr6:data ${NS} kind="gear" version="1"><gear id="cl6.zz.widget" source="CL6-ZZ" page="7" category="Tools" cost="40"><name>Widget</name></gear></sr6:data>`,
}

async function load(on?: boolean, have = FILES) {
  const asked: string[] = []
  const get = async (p: string) => (asked.push(p), have[p] ?? null)
  const { files, missing } = on === undefined ? await collectSr6Files(get) : await collectSr6Files(get, [], on)
  return { c: buildSr6Catalog(files), files: files.map(f => f.file), missing, asked }
}

test('off (the default): nothing of the optional data set is asked for or loaded', async () => {
  for (const on of [undefined, false]) {
    const { c, asked, missing } = await load(on)
    expect(asked.filter(p => p.includes('cl6only'))).toEqual([])
    expect(c.entries.gear.has('cl6.zz.widget')).toBe(false)
    expect(c.sources.has('CL6-ZZ')).toBe(false)
    expect(c.entries.gear.get('zz.lamp')?.source).toBe('ZZ')
    expect(missing).toEqual([])
  }
})

test('on: its files load after the books’, its entries under their own not-canon source, the books’ untouched', async () => {
  const { c, files, missing } = await load(true)
  expect(missing).toEqual([])
  expect(files).toEqual(['data/sr6/sources.xml', 'custom/sr6/imported/zz/gear.xml', 'custom/sr6/cl6only/sources.xml', 'custom/sr6/cl6only/gear.xml'])
  expect(c.errors).toEqual([])
  const w = c.entries.gear.get('cl6.zz.widget')!
  expect([w.name, w.source, w.page, w.attrs.cost]).toEqual(['Widget', 'CL6-ZZ', 7, '40'])
  expect(c.sources.get('CL6-ZZ')).toMatchObject({ name: 'CommLink6 only: Zed Book', canon: false })
  expect(c.sources.get('ZZ')?.canon).toBe(true)
  expect(c.entries.gear.get('zz.lamp')?.source).toBe('ZZ')
})

test('on with no data set on the server: its index is reported missing, the books still load', async () => {
  const books = Object.fromEntries(Object.entries(FILES).filter(([p]) => !p.includes('cl6only')))
  const { c, missing } = await load(true, books)
  expect(missing).toEqual(['custom/sr6/cl6only/index.xml'])
  expect(c.entries.gear.has('zz.lamp')).toBe(true)
})

test('the setting is an optional on/off one the shipped defaults leave unset, so it is off', () => {
  expect(CREATION_KEYS.find(k => k.key === CL6_ONLY_KEY)).toMatchObject({ type: 'bool', group: 'Optional rules', methods: [] })
  const { rules, errors } = parseCreation(readFileSync('public/data/sr6/creation-defaults.xml', 'utf8'))
  expect(errors).toEqual([])
  expect(flag(rules, CL6_ONLY_KEY)).toBeUndefined()
})
