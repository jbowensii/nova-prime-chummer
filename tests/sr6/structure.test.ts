// The item structure (src/sr6/engine/structure.ts): read from an entry's slot, fits, variant, relevance and flag children
// and its modonly, size and ammoClass attributes. Made-up entry.
import { expect, test } from 'vitest'
import { validateXML } from 'xmllint-wasm'
import { readFileSync } from 'node:fs'
import { toEntry } from '../../src/sr6/engine/entryxml'
import { structureOf } from '../../src/sr6/engine/structure'
import { effectBonuses, maxEffects } from '../../src/sr6/engine/effects'
import type { Sr6Data } from '../../src/sr6/engine/data'

const NS = 'urn:chummer-sr6:data:1'
const doc = `<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="${NS}" kind="weapons" version="1">
  <weapon id="zz.widget" source="ZZ" page="3" category="Zed" size="Military" ammoClass="Heavy" modonly="true" avail="2" cost="10">
    <name>Widget</name><slot id="under" value="2"/><slot id="top"/><fits slot="internal"/><variant name="Long"/><variant name="Short"/>
    <relevance topic="combat"/><flag>codemod</flag>
    <modifier kind="valmod" type="ATTRIBUTE" ref="AGILITY" value="1"/><prerequisite kind="datareq" type="QUALITY" ref="zed"/><selection type="SKILL"/><text/>
  </weapon>
</sr6:data>`

test('structureOf reads the slots, fits, variants, relevance, flags and the add-on, size and ammunition class', () => {
  const el = new DOMParser().parseFromString(doc, 'text/xml').getElementsByTagName('weapon')[0]
  expect(structureOf(toEntry(el, 'weapons'))).toEqual({
    slots: [{ id: 'under', value: '2' }, { id: 'top' }],
    fits: ['internal'],
    variants: ['Long', 'Short'],
    relevance: ['combat'],
    flags: ['codemod'],
    modifiers: [{ kind: 'valmod', type: 'ATTRIBUTE', ref: 'AGILITY', value: '1' }],
    prerequisites: [{ kind: 'datareq', type: 'QUALITY', ref: 'zed' }],
    selections: [{ type: 'SKILL' }],
    modOnly: true,
    size: 'Military',
    ammoClass: 'Heavy',
  })
})

test('an entry with none of them has an empty structure', () => {
  const el = new DOMParser()
    .parseFromString(doc.replace(/<(slot|fits|variant|relevance|modifier|prerequisite|selection)[^>]*\/>|<flag>.*?<\/flag>/g, ''), 'text/xml')
    .getElementsByTagName('weapon')[0]
  const s = structureOf(toEntry(el, 'weapons'))
  expect([s.slots, s.fits, s.variants, s.relevance, s.flags]).toEqual([[], [], [], [], []])
})

test('the data schema accepts the structure', async () => {
  const dir = 'public/data/sr6/schema/'
  const r = await validateXML({
    xml: [{ fileName: 'w.xml', contents: doc }],
    schema: [{ fileName: 'weapons.xsd', contents: readFileSync(dir + 'weapons.xsd', 'utf8') }],
    preload: [{ fileName: 'common.xsd', contents: readFileSync(dir + 'common.xsd', 'utf8') }],
  })
  expect(r.errors.map(e => e.message)).toEqual([])
})

test('Commlink6’s own rule data on an entry changes none of the maths: only the entry’s <effect>s are applied', () => {
  const xml = (extra: string) => `<?xml version="1.0" encoding="UTF-8"?>
<sr6:data xmlns:sr6="${NS}" kind="qualities" version="1">
  <quality id="zz.q" source="ZZ" page="1" kind="positive" karma="5"><name>Zed</name><effect target="attr:agi" op="add" value="1"/>${extra}<text/></quality>
</sr6:data>`
  const entry = (extra: string) => toEntry(new DOMParser().parseFromString(xml(extra), 'text/xml').getElementsByTagName('quality')[0], 'qualities')
  const plain = entry(''),
    withData = entry(
      '<modifier kind="valmod" type="ATTRIBUTE" ref="AGILITY" value="2"/><modifier kind="checkmod" type="SKILL" ref="stealth" value="3"/><prerequisite kind="datareq" type="METATYPE" ref="troll"/><selection type="SKILL"/>',
    )
  const data = {} as Sr6Data
  expect(effectBonuses(data, withData)).toEqual(effectBonuses(data, plain))
  expect(effectBonuses(data, plain).length).toBe(1)
  expect(maxEffects(withData)).toEqual(maxEffects(plain))
  expect(structureOf(withData).modifiers).toHaveLength(2)
})
