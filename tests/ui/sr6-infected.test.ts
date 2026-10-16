// The SR6 editor's Awakened flag and Infected type (Creation method, src/sr6/ui/tabs/Method.tsx) on the made-up fixture:
// the override shows what it overrides; the Infected section shows only while the table allows Infected characters, and
// taking a type (Undo gives it back) Awakens a mundane. Made-up runner, type and prices.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/engine/charxml'
import { sr6Data } from '../../src/sr6/engine/data'
import { blankSr6 } from '../../src/sr6/model/character'
import { Sr6EditorView } from '../../src/sr6/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM } from '../sr6/fixture'
import { button, change, click, fakeStore, field, mount, pageText, stubFetch } from './dom'

const LURKER =
  '<quality id="crb.zap-lurker" source="CRB" page="71" kind="positive" karma="30" class="INFECTED"><name>Zap Lurker</name>' +
  '<infected strain="I" printed="Ia" base="Glimmerkin" awakens="adept" freePhysical="2" freeMental="2" magicMax="ess+initiate-grade"/>' +
  '<karmaif flag="awakened" value="20" note="less 10 if the character is already Awakened"/><text/></quality>'
const c = fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('</sr6:data>', `${LURKER}\n</sr6:data>`) : x))
const data = sr6Data(c)

async function open(magic: 'mundane' | 'technomancer', infected: boolean) {
  const cr = fixtureCreation()
  if (infected) cr.set('infectedAllowed', { key: 'infectedAllowed', value: true })
  const ch = blankSr6('karma', 'made-up-i', '2026-10-16T00:00:00.000Z')
  ch.build.metatype = GLIM
  ch.build.magic = magic
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data, cr, id: ch.id, tab: 'method' }))
  return async () => {
    await click(button('Save'))
    const r = xmlToSr6(store.rows.get(ch.id)!.xml)
    if (!r.ok) throw new Error(r.reason)
    return r.character.build
  }
}

test('Awakened: derived (a technomancer is not), overridden with what it overrides, saved', async () => {
  const saved = await open('technomancer', false)
  expect(pageText()).toMatch(/Derived: not Awakened \(technomancer: Emerged, not Awakened\)/)
  expect(pageText()).not.toMatch(/Infected \(HMHVV/)
  await change(field('Awakened'), 'yes')
  expect(pageText()).toMatch(/Derived: not Awakened \(technomancer: Emerged, not Awakened\) — overridden to Awakened\./)
  expect((await saved()).awakened).toBe(true)
})

test('Infected: the type selector Awakens a mundane as its adept; Undo gives the runner back', async () => {
  const saved = await open('mundane', true)
  await change(field(/^Infected \(HMHVV/), true)
  await change(field('Infected type'), 'crb.zap-lurker')
  expect(pageText()).toMatch(/the book gives no creation Essence for Strain I/)
  expect(pageText()).toMatch(/Magic kind: Mundane → Adept/)
  await click(button('Undo'))
  expect(pageText()).not.toMatch(/Magic kind: Mundane → Adept/)
  const back = await saved()
  expect([back.magic, back.infectedFrom, back.qualities]).toEqual(['mundane', undefined, []])
  await click(button('Redo'))
  const b = await saved()
  expect([b.magic, b.infectedFrom, b.qualities.map(q => q.id)]).toEqual(['adept', 'mundane', ['crb.zap-lurker']])
  // the kind select still picks the bought kind, the type deciding the rest (a magician: a mystic adept)
  expect(field<HTMLSelectElement>('Magic kind').value).toBe('mundane')
  expect(pageText()).toMatch(/The Infected type makes the runner Adept \(bought as mundane\)/)
  await change(field('Magic kind'), 'full')
  const m = await saved()
  expect([m.magic, m.infectedFrom]).toEqual(['mystic-adept', 'full'])
})
