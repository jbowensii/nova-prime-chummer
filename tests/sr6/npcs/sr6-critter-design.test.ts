// The GM critter editor (owner 2026-10-16, BUILDER Q11) in NPCs & Critters: New critter from a catalog critter opens
// designed on its Design tab; Copy; Copy to compendium as a critter (a critters entry a runner can own); the Design tab's
// attributes, a power and a weakness from the catalog with a level and a note, a skill, the derived values beside the
// stat block's (Use worked out), warnings, the generated lines on the Stat block tab, Undo and the saved file. Made-up
// critters and powers on the made-up fixture.
import { createElement, type ReactElement } from 'react'
import { expect, test, vi } from 'vitest'
import { Me, type User } from '../../../src/core/ui-kit/auth'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { readSr6Compendium, sr6CompendiumXml } from '../../../src/sr6/formats/domain/compendium'
import { designCritter } from '../../../src/sr6/npcs/domain/critterdesign'
import { sr6Data } from '../../../src/sr6/catalog/domain/data'
import { blankSr6Npc } from '../../../src/sr6/engine/npc'
import type { Sr6Compendium } from '../../../src/sr6/formats/domain/character'
import { Sr6EditorView } from '../../../src/sr6/shell/ui/EditorView'
import { Sr6Npcs } from '../../../src/sr6/npcs/ui/Npcs'
import { fixtureCatalog, fixtureCreation } from '../catalog/fixture'
import { button, change, click, fakeStore, field, mount, option, pageText, stubFetch } from '../../ui/dom'

const NS = 'xmlns:sr6="urn:chummer-sr6:data:1"'
const at = 'source="ZZ" page="3"'
const POWERS = `<sr6:data ${NS} kind="critterpowers" version="1">
  <critterpower id="zz.armor" ${at} type="P"><name>Armor</name><text/></critterpower>
  <critterpower id="zz.soap-allergy" ${at} type="P" weakness="true"><name>Soap Allergy</name><text/></critterpower>
</sr6:data>`
const c = fixtureCatalog(undefined, [{ file: 'custom/sr6/imported/zz/critterpowers.xml', xml: POWERS }]),
  data = sr6Data(c),
  cr = fixtureCreation()
const GM = { id: 'u1', username: 'gm', role: 'gm', name: 'Gil' } as User
const asGm = (el: ReactElement) => createElement(Me.Provider, { value: GM }, el)
const read = (xml: string) => {
  const r = xmlToSr6(xml)
  if (!r.ok) throw new Error(r.reason)
  return r.character
}
const kit: Sr6Compendium = { id: '0123456789ab', name: 'Street Kit', source: 'STREET', sharing: 'table', updatedAt: '', entries: [], npcs: [] }
const main = () => pageText(document.querySelector('main.work')!)

test('New critter from the catalog opens designed on its Design tab; Copy; Copy to compendium as a critter', async () => {
  const store = fakeStore('sr6/npcs')
  let compXml = ''
  const calls = stubFetch([
    [/\/api\/sr6\/campaigns$/, () => []],
    [/\/api\/sr6\/npcs\/trash/, () => ({ user: 'gm', name: 'Gil', items: [] })],
    [
      /\/api\/sr6\/compendiums/,
      (_, init) => {
        if (init?.method === 'PUT') {
          compXml = String(init.body)
          return { rev: 2 }
        }
        return [{ id: kit.id, file: `${kit.id}.xml`, rev: 1, xml: sr6CompendiumXml(kit), owner: 'gm', ownerName: 'Gil' }]
      },
    ],
    store.route,
  ])
  const reload = vi.fn()
  const page = (key: string) => asGm(createElement(Sr6Npcs, { key, c, data, cr, section: 'critters', reload }))
  const { rerender } = await mount(page('a'))
  await click(button('New critter'))
  await change(field('From the catalog'), 'crb.fuzzbeast')
  await click(button(/^Create/, document.querySelector('dialog[open]')!))
  const [ch] = [...store.rows.values()].map(r => read(r.xml))
  expect(location.hash).toBe(`#/sr6/n/${ch.id}/design`)
  // the printed lines read into the catalog's critter powers (Glimmer) and kept by name (Thick Fur); printed values stay
  expect(ch.npc?.design?.powers).toEqual([{ id: 'crb.glimmer', name: 'Glimmer' }, { name: 'Thick Fur' }])
  expect(ch.npc?.stats).toMatchObject({ cm: '10', dr: '6' })
  await rerender(page('b')) // (back on the list)

  await click(button('Copy Fuzzbeast'))
  expect([...store.rows.values()].map(r => read(r.xml).identity.streetName).sort()).toEqual(['Fuzzbeast', 'Fuzzbeast (copy)'])

  await click(button('Copy Fuzzbeast to a compendium as a critter…'))
  await click(button(/^Copy$/, document.querySelector('dialog[open]')!))
  expect(calls.some(x => x.init?.method === 'PUT' && /compendiums\/0123456789ab/.test(x.url))).toBe(true)
  const comp = readSr6Compendium(compXml)
  if (!comp.ok) throw new Error(comp.error)
  expect(comp.compendium.entries).toMatchObject([{ id: 'street.fuzzbeast', kind: 'critters', name: 'Fuzzbeast', source: 'STREET', attrs: { bod: '4' } }])
  expect(comp.compendium.entries[0].parts.find(p => p.tag === 'powers')?.text).toBe('Glimmer, Thick Fur')
  expect(reload).toHaveBeenCalled()
  expect(pageText()).toMatch(/runners at a table it’s shared with can own it on their Critters tab/)
})

test('the Design tab: attributes, a power and a weakness with a level and a note, a skill, derived values, warnings, Undo, the file', async () => {
  const ch = blankSr6Npc('critter', undefined, '2026-10-16T00:00:00.000Z')
  ch.identity.streetName = 'Puddle Drake'
  designCritter(ch.npc!, data, cr)
  const store = fakeStore('sr6/npcs', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  const editor = (key: string) => asGm(createElement(Sr6EditorView, { key, c, data, cr, id: ch.id, tab: 'design', npc: true }))
  const { rerender } = await mount(editor('a'))
  expect([...document.querySelectorAll('nav.tabs a')].map(a => a.textContent)).toEqual(['Concept', 'Stat block', 'Design', 'Print'])
  for (let i = 0; i < 4; i++) await click(button('Raise BOD'))
  await click(button('Raise REA'))
  await click(button('Raise INT'))
  await click(button('Raise Initiative dice'))
  await click(button('Add power…'))
  await click(option('Armor'))
  await change(field('Armor level'), '2')
  await click(button('Add weakness…'))
  expect(document.querySelector('dialog[open]')!.textContent).not.toMatch(/Armor/) // only weaknesses offered
  await click(option('Soap Allergy'))
  await change(field('Soap Allergy note'), 'mild')
  await change(field('Add skill'), 'crb.glowcraft')
  await click(button('Raise Glowcraft rank'))
  // fixture settings: monitor 9 + ceil(4 / 3); Defense 4 + Armor 2; Initiative 1 + 1 with 2 dice
  const rows = Object.fromEntries([...document.querySelectorAll('main.work tbody tr')].map(r => [r.children[0].textContent, r.children[1].textContent]))
  expect(rows).toEqual({ 'Condition monitor': '11', 'Defense Rating': '6', Initiative: '2 + 2D6' })
  expect(main()).toMatch(/Glowcraft uses Magic; the critter has none\. \(CRB p\. 96\)/)
  // Magic raised: the warning goes
  await click(button('Raise Magic'))
  expect(main()).not.toMatch(/Glowcraft uses Magic/)
  await click(button('Save'))
  let saved = read(store.rows.get(ch.id)!.xml)
  expect(saved.npc?.design).toEqual({
    powers: [{ id: 'zz.armor', name: 'Armor', level: 2 }],
    weaknesses: [{ id: 'zz.soap-allergy', name: 'Soap Allergy', note: 'mild' }],
    skills: [{ id: 'crb.glowcraft', name: 'Glowcraft', rank: 2 }],
    dice: 2,
  })
  expect(saved.npc?.stats).toMatchObject({ bod: '4', rea: '1', int: '1', mag: '1', cm: '11', dr: '6', init: '2 + 2D6' })
  expect(saved.npc?.lines).toEqual([
    { part: 'powers', text: 'Armor 2' },
    { part: 'weaknesses', text: 'Soap Allergy (mild)' },
    { part: 'skills', text: 'Glowcraft 2' },
  ])
  // a Defense Rating typed on the Stat block tab stays; Use worked out takes the derived one back
  saved.npc!.stats.dr = '9'
  store.rows.set(ch.id, { file: `${ch.id}.xml`, rev: store.rows.get(ch.id)!.rev, xml: sr6ToXml(saved) })
  await rerender(editor('b'))
  await click(button('Raise BOD'))
  expect(main()).toMatch(/Defense Rating\s*7\s*9/)
  await click(button('Use the worked-out Defense Rating'))
  await click(button('Undo'))
  await click(button('Remove Soap Allergy'))
  await click(button('Save'))
  saved = read(store.rows.get(ch.id)!.xml)
  expect(saved.npc?.stats.dr).toBe('9')
  expect(saved.npc?.design?.weaknesses).toEqual([])
  expect(saved.npc?.lines.map(l => l.part)).toEqual(['powers', 'skills'])
})

test('the Stat block tab: a designed critter’s generated lines are read only; a grunt has no Design tab', async () => {
  const ch = blankSr6Npc('critter', undefined, '2026-10-16T00:00:00.000Z')
  designCritter(ch.npc!, data, cr)
  const store = fakeStore('sr6/npcs', { [ch.id]: sr6ToXml(ch) })
  stubFetch([store.route])
  const { rerender } = await mount(asGm(createElement(Sr6EditorView, { key: 'a', c, data, cr, id: ch.id, tab: 'stats', npc: true })))
  expect(field<HTMLTextAreaElement>('Powers').readOnly).toBe(true)
  expect(field<HTMLTextAreaElement>('Attacks').readOnly).toBe(false)
  expect(main()).toMatch(/Skills, powers and weaknesses come from the Design tab/)
  const grunt = blankSr6Npc('grunt')
  const s2 = fakeStore('sr6/npcs', { [grunt.id]: sr6ToXml(grunt) })
  stubFetch([s2.route])
  await rerender(asGm(createElement(Sr6EditorView, { key: 'b', c, data, cr, id: grunt.id, tab: 'design', npc: true })))
  expect([...document.querySelectorAll('nav.tabs a')].map(a => a.textContent)).toEqual(['Concept', 'Stat block', 'Print'])
})
