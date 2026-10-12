import { createElement } from 'react'
import { expect, test, vi } from 'vitest'
import { mount } from './dom'

// /?signin=<key> is read once, when the page loads: a fresh module for each address.
async function pageAt(search: string) {
  vi.resetModules()
  history.replaceState(null, '', '/' + search)
  const { SignIn } = await import('../../src/ui/SignIn')
  const { el } = await mount(createElement(SignIn, { onSignedIn: () => {} }))
  return el.textContent ?? ''
}

test('a known ?signin= says its reason', async () => {
  expect(await pageAt('?signin=expired')).toContain('took too long')
  expect(location.search).toBe('') // taken off the address
})

test('an unknown ?signin= says the generic reason; __proto__ and toString do not blank the page', async () => {
  for (const key of ['nope', '__proto__', 'toString', 'constructor']) expect(await pageAt('?signin=' + key)).toContain('Signing in with Authelia didn’t work')
})
