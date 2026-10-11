// Every SR6 creation setting has hover text in plain words with its book and page, or "house rule" or "option", and
// no label or hover text names another app (owner, 2026-10-11).
import { expect, test } from 'vitest'
import { aboutOf, expandKeys, keyType, RUNNER_RULE_KEYS } from '../../src/sr6/engine/creation'

const keys = expandKeys({ metatypes: { 'x.made-up': { id: 'x.made-up', name: 'Made-up' } } })

test('every setting has hover text ending with its book and page, house rule or option', () => {
  const bad = keys.filter(k => !/\((.*\bpp?\. [\d–, ]+|house rule|option)\)\.$/.test(aboutOf(k.key))).map(k => k.key)
  expect(bad).toEqual([])
})

test('no label or hover text names another app', () => {
  const app = /commlink ?6|chummer|forge|genesis/i
  expect(keys.filter(k => app.test(k.label) || app.test(aboutOf(k.key))).map(k => k.key)).toEqual([])
})

test('the runner panel lists real settings, each with its hover text', () => {
  expect(RUNNER_RULE_KEYS.filter(r => !keyType(r.key) || !r.about).map(r => r.key)).toEqual([])
})
