// SR6 save-format upgrades (src/sr6/formats/domain/migrations): a current file loads unchanged, old files step up,
// newer files are refused, and every SR6 runner fixture round-trips xml -> character -> xml unchanged.
import { readdirSync, readFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { sr6ToXml, xmlToSr6 } from '../../../src/sr6/formats/domain/charxml'
import { SR6_MIGRATIONS, upgradeSr6 } from '../../../src/sr6/formats/domain/migrations'

const FIX = 'tests/fixtures/sr6'
const runners = readdirSync(FIX)
  .filter(f => f.endsWith('.xml'))
  .map(f => [f, readFileSync(`${FIX}/${f}`, 'utf8')] as const)
  .filter(([, x]) => x.includes('urn:chummer-sr6:character:1'))

test('ships with no steps, so the format stays 1', () => expect(SR6_MIGRATIONS).toHaveLength(0))

test('there are SR6 runner fixtures to check', () => expect(runners.length).toBeGreaterThanOrEqual(3))

test.each(runners)('%s round-trips xml -> character -> xml unchanged', (_, xml) => {
  const a = xmlToSr6(xml)
  expect(a.ok).toBe(true)
  if (!a.ok) return
  const out = sr6ToXml(a.character, a.rev)
  const b = xmlToSr6(out)
  expect(b.ok && b.character).toEqual(a.character)
  // the writer fills in defaults an older writer left out (sample-glow-runner), so the fixed point is the second write
  expect(b.ok && sr6ToXml(b.character, a.rev)).toBe(out)
})

test('a version-1 file loads unchanged', () => {
  const xml = runners[0][1]
  const a = xmlToSr6(xml)
  expect(a.ok && a.character.formatVersion).toBe(1)
})

test('a fake step list upgrades an old file one step at a time and stamps the version', () => {
  const doc = new DOMParser().parseFromString('<character formatVersion="1" name="old"/>', 'application/xml')
  const root = doc.documentElement
  const seen: string[] = []
  const steps = [
    (r: Element) => {
      seen.push(`1:${r.getAttribute('formatVersion')}`)
      r.setAttribute('streetName', r.getAttribute('name')!)
      r.removeAttribute('name')
    },
    (r: Element) => {
      seen.push(`2:${r.getAttribute('formatVersion')}`)
      r.setAttribute('streetName', r.getAttribute('streetName')!.toUpperCase())
    },
  ]
  upgradeSr6(root, 1, steps)
  expect(seen).toEqual(['1:1', '2:2'])
  expect(root.getAttribute('formatVersion')).toBe('3')
  expect(root.getAttribute('streetName')).toBe('OLD')
  expect(root.hasAttribute('name')).toBe(false)
  // a file already at format 2 runs only the second step
  const r2 = new DOMParser().parseFromString('<character formatVersion="2" streetName="x"/>', 'application/xml').documentElement
  upgradeSr6(r2, 2, steps)
  expect(r2.getAttribute('streetName')).toBe('X')
  expect(r2.getAttribute('formatVersion')).toBe('3')
})

test('a newer-version file is still refused', () => {
  const xml = runners[0][1].replace(/formatVersion="1"/, 'formatVersion="2"')
  const r = xmlToSr6(xml)
  expect(r.ok).toBe(false)
  expect(!r.ok && r.reason).toMatch(/newer version/)
})

test('a fractional or negative formatVersion is refused, not upgraded', () => {
  for (const v of ['1.5', '-1'])
    expect(xmlToSr6(`<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="${v}" id="r"><build/></sr6:character>`)).toMatchObject({ ok: false })
})
