// Every SR6 creation setting has hover text in plain words with its book and page, or "house rule" or "option", and
// no label or hover text names another app (owner, 2026-10-11), except the Karma build option's numbers, which say they
// are "option (Commlink6 defaults)" (owner's one-off exception, 2026-10-11: no SR6 book prints a Karma build).
import { expect, test } from 'vitest'
import { aboutOf, expandKeys, keyType, RUNNER_RULE_KEYS } from '../../src/sr6/engine/creation'

const keys = expandKeys({ metatypes: { 'x.made-up': { id: 'x.made-up', name: 'Made-up' } } })
const KARMA_BUILD = 'option (Commlink6 defaults)'

test('every setting has hover text ending with its book and page, house rule or option', () => {
  const bad = keys.filter(k => !/\((.*\bpp?\. [\d–, ]+|house rule|option|option \(Commlink6 defaults\))\)\.$/.test(aboutOf(k.key))).map(k => k.key)
  expect(bad).toEqual([])
})

test('no label or hover text names another app, but the Karma build option’s numbers', () => {
  const app = /commlink ?6|chummer|forge|genesis/i
  expect(keys.filter(k => app.test(k.label) || app.test(aboutOf(k.key).replace(KARMA_BUILD, ''))).map(k => k.key)).toEqual([])
})

test('the Karma build option’s numbers say no SR6 book prints a Karma build and that they are Commlink6’s defaults', () => {
  const karma = keys.filter(k => k.group === 'Karma build' || /\.karmaBuild$/.test(k.key)).map(k => k.key)
  expect(karma).toHaveLength(12)
  for (const k of karma) {
    expect(aboutOf(k), k).toMatch(/no SR6 book prints a Karma build/i)
    expect(aboutOf(k), k).toContain(`(${KARMA_BUILD}).`)
  }
})

test('the runner panel lists real settings, each with its hover text', () => {
  expect(RUNNER_RULE_KEYS.filter(r => !keyType(r.key) || !r.about).map(r => r.key)).toEqual([])
})
