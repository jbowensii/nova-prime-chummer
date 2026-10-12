// @vitest-environment node
// server/compendiums.mjs withoutNpcs: players' copy of a shared compendium, its NPCs taken out. Linear on hostile input (it
// runs on every GET /api/compendiums/shared), and the same output the old regex gave on files the app writes.
import { expect, test } from 'vitest'
// @ts-expect-error plain JS module
import { withoutNpcs } from '../../server/compendiums.mjs'

const OLD = /<(?:[\w.-]+:)?character\b(?:[^>]*\/>|[\s\S]*?<\/(?:[\w.-]+:)?character\s*>)/g
const old = (xml: string) => { const out = xml.replace(OLD, ''); return /<(?:[\w.-]+:)?character\b|<!DOCTYPE|<!\[CDATA\[/i.test(out) ? null : out }

test('NPCs come out as before, and a 1 MB file of unclosed <character tags is refused fast', () => {
  for (const xml of ['<ca2:data><e name="Zed"/><character id="a"><n>x</n></character><e/></ca2:data>',
    '<d><ca2:character id="a"/><x/><character a="1">t</character ><y/></d>', '<d><charactery/></d>', '<d><character x="1"></d>'])
    expect(withoutNpcs(xml)).toBe(old(xml))
  const t = performance.now()
  expect(withoutNpcs('<d>' + '<character '.repeat(100_000))).toBeNull()
  expect(performance.now() - t).toBeLessThan(500)
})
