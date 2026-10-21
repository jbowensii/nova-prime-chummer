// The Users page (src/features/accounts/Users.tsx) over a stand-in accounts API: the list with each account's runners, adding an
// account (a refusal shown in the form), editing one, disabling, unlinking from Authelia, resetting a password, moving a
// runner to another account and deleting. Made-up accounts.
import { createElement } from 'react'
import { expect, test } from 'vitest'
import { characterToXml } from '../../../src/ca2/formats/domain/charxml'
import { blankCharacter } from '../../../src/ca2/formats/domain/file'
import { UsersScreen } from '../../../src/features/accounts/Users'
import { button, change, click, field, mount, pageText, stubFetch } from '../../ui/dom'

const acct = (id: string, username: string, name: string, extra = {}) => ({
  id,
  username,
  name,
  email: null,
  role: 'player',
  method: 'password',
  enabled: true,
  created: '2026-01-01T00:00:00Z',
  lastLogin: null,
  ...extra,
})
const runner = () => {
  const ch = blankCharacter()
  ch.identity.streetName = 'Made-up Runner'
  return characterToXml(ch)
}

function server() {
  const sent: { url: string; method: string; body: unknown }[] = []
  const log = (url: string, init?: RequestInit) =>
    sent.push({ url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined })
  stubFetch([
    [
      /\/api\/users$/,
      (url, init) => {
        log(url, init)
        if (init?.method === 'POST')
          return (init.body as string).includes('"taken"') ? new Response('{"error":"that username is taken"}', { status: 409 }) : { ok: true }
        return [
          acct('a1', 'ann', 'Made-up Ann', { linked: true, method: 'authelia', runners: 0 }),
          acct('b2', 'bo', 'Made-up Bo', { role: 'editor', runners: 1 }),
        ]
      },
    ],
    [/\/api\/users\//, (url, init) => (log(url, init), { ok: true })],
    [/\/api\/characters$/, () => [{ file: 'r.xml', xml: runner(), owner: 'bo' }]],
    [/\/api\/sr6\/characters$/, () => []],
  ])
  return sent
}
const dialog = () => document.querySelector('dialog[open]')!

test('the accounts list, and adding one: a refusal shows in the form, then it is added', async () => {
  const sent = server()
  await mount(createElement(UsersScreen))
  expect(pageText()).toMatch(/Made-up Ann.*Made-up Bo/)
  await click(button('Add account'))
  await change(field('Name', dialog()), 'Made-up Cy')
  await change(field('Username', dialog()), 'taken')
  await change(document.querySelector<HTMLInputElement>('dialog[open] input[type=password]')!, 'a-made-up-password')
  await click(button('Add account', dialog()))
  expect(pageText(dialog())).toMatch(/That username is taken\./)
  await change(field('Username', dialog()), 'cy')
  await change(field('Role', dialog()), 'editor')
  await click(button('Add account', dialog()))
  expect(pageText()).toMatch(/Added Made-up Cy\. They can sign in as cy\./)
  expect(sent.find(s => s.method === 'POST' && s.url.endsWith('/api/users') && (s.body as { username: string }).username === 'cy')?.body).toMatchObject({
    role: 'editor',
    method: 'password',
  })
})

test('edit, disable, unlink, reset a password, move a runner and delete', async () => {
  const sent = server()
  await mount(createElement(UsersScreen))
  await click(button('Edit Made-up Bo'))
  await change(field('Username', dialog()), 'bobo')
  expect(pageText(dialog())).toMatch(/They sign in as bobo from now on/)
  await click(button('Save changes'))
  expect(pageText()).toMatch(/Saved Made-up Bo\. They sign in as bobo now\./)

  await click(button('Disable Made-up Bo'))
  expect(pageText()).toMatch(/Made-up Bo is disabled and signed out\./)
  await click(button('Unlink Made-up Ann from Authelia'))
  expect(pageText()).toMatch(/Made-up Ann is unlinked from Authelia/)

  await click(button('Reset Made-up Bo’s password'))
  await change(document.querySelector<HTMLInputElement>('dialog[open] input[type=password]')!, 'another-made-up-pw')
  await click(button(/^Reset|^Set/, dialog()))
  expect(sent.some(s => s.url.endsWith('/api/users/b2/reset-password'))).toBe(true)

  await click(button('Move Made-up Bo’s runners'))
  expect(pageText(dialog())).toMatch(/Made-up Runner/)
  await click(button(/^Move/, dialog()))
  expect(sent.find(s => s.url.endsWith('/api/users/b2/move-runner'))?.body).toMatchObject({ file: 'r.xml', to: 'a1', game: 'ca2' })

  await click(button('Delete Made-up Ann'))
  await click(button(/^Delete/, dialog()))
  expect(sent.some(s => s.method === 'DELETE' && s.url.endsWith('/api/users/a1'))).toBe(true)
})
