// The SR6 editor's Awakened flag and Infected type (Creation method, src/sr6/ui/tabs/Method.tsx) on the made-up fixture:
// the override shows what it overrides; the Infected section shows only while the table allows Infected characters, and
// taking a type (Undo gives it back) Awakens a mundane; Qualities offers only the type's optional powers. Made-up runner,
// types and prices.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../src/sr6/formats/domain/charxml'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { blankSr6 } from '../../src/sr6/formats/domain/character'
import { Sr6EditorView } from '../../src/sr6/shell/ui/EditorView'
import { fixtureCatalog, fixtureCreation, GLIM, STONE } from '../sr6/catalog/fixture'
import { button, change, click, fakeStore, field, mount, pageText, stubFetch } from './dom'

const LURKER =
  '<quality id="crb.zap-lurker" source="CRB" page="71" kind="positive" karma="30" class="INFECTED"><name>Zap Lurker</name>' +
  '<infected strain="I" printed="Ia" base="Glimmerkin" awakens="adept" freePhysical="2" freeMental="2" magicMax="ess+initiate-grade"/>' +
  '<optionalpower ref="crb.zap-power.glow" free="true"/><optionalpower ref="crb.zap-power.bite"/>' +
  '<karmaif flag="awakened" value="20" note="less 10 if the character is already Awakened"/><text/></quality>'
const MORE = [
  LURKER,
  // Strain III, no optional powers; the vampire any other metatype takes through its sidebar's terms
  '<quality id="crb.zap-ghoul" source="CRB" page="70" kind="positive" karma="20" class="INFECTED"><name>Zap Ghoul</name>' +
    '<infected strain="III" base="Glimmerkin" freePhysical="2" freeMental="2" essence="4" magic="1" magicLoss="1" magicMax="5+initiate-grade"/><text/></quality>',
  '<quality id="crb.zap-vampire" source="CRB" page="72" kind="positive" karma="27" class="INFECTED"><name>Zap Vampire</name>' +
    '<infected strain="I" base="Glimmerkin" awakens="magician" freePhysical="2" freeMental="2" magicMax="ess+initiate-grade"/>' +
    '<infectedalt base="other" karma="32" bod="1" note="32 Karma for a non-glimmerkin vampire"/><text/></quality>',
  '<quality id="crb.zap-power.glow" source="CRB" page="70" kind="positive" karma="6" class="INFECTED/OPTIONAL_POWER"><name>Glow</name><text/></quality>',
  '<quality id="crb.zap-power.bite" source="CRB" page="70" kind="positive" karma="8" class="INFECTED/OPTIONAL_POWER"><name>Bite</name><text/></quality>',
  '<quality id="crb.zap-power.shell" source="CRB" page="70" kind="positive" karma="4" class="INFECTED/OPTIONAL_POWER"><name>Shell</name><text/></quality>',
  // an Awakened price with no note of its own
  '<quality id="crb.zap-hazing" source="CRB" page="73" kind="negative" karma="8"><name>Zap Hazing</name><karmaif flag="awakened" value="15"/><text/></quality>',
].join('\n')
const c = fixtureCatalog((f, x) => (f.endsWith('crb/qualities.xml') ? x.replace('</sr6:data>', `${MORE}\n</sr6:data>`) : x))
const data = sr6Data(c)

async function open(
  magic: 'mundane' | 'technomancer',
  infected: boolean,
  o: { tab?: string; metatype?: string; atCreation?: boolean; qualities?: string[] } = {},
) {
  const cr = fixtureCreation()
  if (infected) cr.set('infectedAllowed', { key: 'infectedAllowed', value: true })
  if (o.atCreation) cr.set('infectedPowersAtCreation', { key: 'infectedPowersAtCreation', value: true })
  const ch = blankSr6('karma', 'made-up-i', '2026-10-16T00:00:00.000Z')
  ch.build.metatype = o.metatype ?? GLIM
  ch.build.magic = magic
  ch.build.qualities = (o.qualities ?? []).map((id, i) => ({ uid: `q${i}`, id, level: 1 }))
  const store = fakeStore('sr6/characters', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  await mount(createElement(Sr6EditorView, { c, data, cr, id: ch.id, tab: o.tab ?? 'method' }))
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

test('a technomancer taking a Strain III type: Resonance lost, its Essence and Magic shown; unticking Infected takes it away', async () => {
  const saved = await open('technomancer', true, { atCreation: true })
  await change(field(/^Infected \(HMHVV/), true)
  await change(field('Infected type'), 'crb.zap-ghoul')
  const t = pageText()
  expect(t).toMatch(/The technomancer’s Resonance is lost, with no refund\. Magic kind: Technomancer → Mundane\./)
  expect(t).toMatch(/Essence starts at 4\. Magic 1 for a runner without Magic, 1 less for one with it; highest 5\+initiate-grade\./)
  expect(t).toMatch(/Optional powers \(Qualities tab\): none\. This table lets them be bought at creation\./)
  await change(field(/^Infected \(HMHVV/), false)
  const b = await saved()
  expect([b.magic, b.infectedFrom, b.qualities]).toEqual(['technomancer', undefined, []])
})

test('the type selector: another metatype’s vampire through its sidebar, a type not for this metatype kept and named', async () => {
  await open('mundane', true, { metatype: STONE, qualities: ['crb.zap-lurker'] })
  const types = pageText(field<HTMLSelectElement>('Infected type'))
  expect(types).toMatch(/Zap Lurker \(not for this metatype\)/)
  expect(types).toMatch(/Zap Vampire \(Strain I; 32 Karma for a non-glimmerkin vampire\)/)
  await change(field('Infected type'), 'crb.zap-vampire')
  expect(pageText()).toMatch(/Attribute maxima: the type’s \(added to the metatype’s own\)/)
  expect(pageText()).toMatch(/Optional powers \(Qualities tab\): none\. At creation only the free pick/)
})

test('the Awakened override the other way: an Infected runner set not Awakened, with what it overrides', async () => {
  const saved = await open('mundane', true, { qualities: ['crb.zap-lurker'] })
  expect(pageText()).toMatch(/Optional powers \(Qualities tab\): Glow \(free pick\), Bite\. One free pick\./)
  await change(field('Awakened'), 'no')
  expect(pageText()).toMatch(/Derived: Awakened \(Infected: Zap Lurker\) — overridden to not Awakened\./)
  expect((await saved()).awakened).toBe(false)
})

test('Qualities: the type is not offered (Creation method takes it), the optional powers only from its list, Awakened prices shown', async () => {
  await open('mundane', true, { tab: 'qualities', qualities: ['crb.zap-lurker'] })
  expect(pageText()).toMatch(/An Infected type is taken on Creation method; its optional powers here\./)
  expect(pageText()).toMatch(/−30/) // (the type's line, by qualityPrice: not Awakened before it)
  await click(button('Add a positive quality…'))
  const offered = pageText(document.querySelector('dialog[open]')!)
  expect(offered).toMatch(/Glow/)
  expect(offered).toMatch(/Bite/)
  expect(offered).not.toMatch(/Shell|Zap Lurker|Zap Ghoul/)
  await click(button('Close'))
  await click(button('Add a negative quality…'))
  expect(pageText(document.querySelector('dialog[open]')!)).toMatch(/8 \(15 if Awakened; this runner: 15\) karma/)
})
