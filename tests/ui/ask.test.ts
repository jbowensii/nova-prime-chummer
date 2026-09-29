import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, test, vi } from 'vitest'
import { askRules, AskRules, sourceLine } from '../../src/ui/AskRules'
import { joined, type Campaign } from '../../src/ui/Campaigns'
import { Me, type User } from '../../src/ui/auth'

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })
afterEach(() => { vi.restoreAllMocks(); document.body.innerHTML = '' })

test('sources as one plain line: book and page, or the title without a page; no repeats', () => {
  expect(sourceLine([{ source: 'CRB', page: '61', title: 'Armor' }, { source: 'QREF', page: '', title: 'Base' }, { source: 'CRB', page: '61', title: 'Armor' }]))
    .toBe('CRB p.61 · QREF Base')
  expect(sourceLine([])).toBe('')
})

test('a refusal: the daily limit and busy in the server’s own words, anything else with a lead', async () => {
  const f = vi.spyOn(window, 'fetch')
  f.mockResolvedValueOnce(json(429, { error: 'You’ve used today’s 2 questions. Ask again tomorrow.' }, { 'Retry-After': '3600' }))
  expect(await askRules('q')).toEqual({ error: 'You’ve used today’s 2 questions. Ask again tomorrow.' })
  f.mockResolvedValueOnce(json(429, { error: 'Ask the rules is busy; try again in a moment' }, { 'Retry-After': '5' }))
  expect(await askRules('q')).toEqual({ error: 'Ask the rules is busy; try again in a moment.' })
  f.mockResolvedValueOnce(json(502, { error: 'no answer within 60 seconds; try again' }))
  expect(await askRules('q')).toEqual({ error: 'Couldn’t ask the rules: no answer within 60 seconds; try again.' })
})

test('the answer and its sources render as text only, and nothing is stored in the browser', async () => {
  const evil = 'See <img src=x onerror="alert(1)"> and **this** [link](http://evil.test)'
  vi.spyOn(window, 'fetch').mockImplementation(async (_url, init) => init?.method === 'POST'
    ? json(200, { answer: evil, sources: [{ source: '<b>CRB</b>', page: '61', title: '' }], covered: true, used: 1, limit: 2 })
    : json(200, { available: true, limit: 2, used: 0 }))
  const el = document.body.appendChild(document.createElement('div'))
  const root = createRoot(el)
  await act(async () => root.render(createElement(Me.Provider, { value: { id: 'u1', username: 'pia', role: 'player' } as User }, createElement(AskRules))))
  const input = el.querySelector('input')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'How far can I jump?')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await act(async () => el.querySelector('form')!.requestSubmit())
  expect(el.textContent).toContain(evil)
  expect(el.textContent).toContain('Sources: <b>CRB</b> p.61')
  expect(el.textContent).toContain('1 question left today.')
  expect(el.querySelector('img, b, a, strong')).toBeNull()
  expect([localStorage.length, sessionStorage.length]).toEqual([0, 0])
  root.unmount()
})

test('a campaign a runner can join: one you run or play in; the admin sees them all but isn’t in each', () => {
  const c = (you: Campaign['you'], people: string[] = []) => ({ you, gms: people.map(username => ({ username, name: username })), members: [] }) as unknown as Campaign
  const me = { username: 'ada' } as User
  expect([joined(c('gm'), me), joined(c('member'), me), joined(c('admin'), me), joined(c('admin', ['ada']), me)]).toEqual([true, true, false, true])
})
