// Small jsdom helpers for the UI behaviour tests: mount a React element, find controls by their text or label, click,
// type and choose like a user, and let pending promises settle. No testing library: plain DOM and React's act().
import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// jsdom's <dialog> lacks showModal/close: open and close it by hand
if (!HTMLDialogElement.prototype.showModal)
  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
    this.open = true
  }
if (!HTMLDialogElement.prototype.close)
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.open = false
  }

let roots: Root[] = []
afterEach(async () => {
  for (const r of roots) await act(async () => r.unmount())
  roots = []
  document.body.innerHTML = ''
  localStorage.clear()
  location.hash = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** Let effects and pending promises (fetches, repo loads) run. */
export async function settle(times = 5) {
  for (let i = 0; i < times; i++) await act(async () => new Promise(r => setTimeout(r, 0)))
}

export async function mount(node: ReactElement) {
  const el = document.body.appendChild(document.createElement('div'))
  const root = createRoot(el)
  roots.push(root)
  await act(async () => root.render(node))
  await settle()
  const rerender = async (n: ReactElement) => {
    await act(async () => root.render(n))
    await settle()
  }
  return { el, rerender }
}

const text = (e: Element) => (e.textContent ?? '').replace(/\s+/g, ' ').trim()
const matches = (s: string, want: string | RegExp) => (typeof want === 'string' ? s === want : want.test(s))

/** The button whose text or aria-label is `name` (a string matches exactly, after collapsing spaces). */
export function button(name: string | RegExp, within: ParentNode = document.body): HTMLButtonElement {
  const b = [...within.querySelectorAll('button')].find(b => matches(text(b), name) || matches(b.getAttribute('aria-label') ?? '', name))
  if (!b) throw new Error(`no button ${name}; buttons: ${[...within.querySelectorAll('button')].map(text).join(' | ')}`)
  return b
}
export const hasButton = (name: string | RegExp, within: ParentNode = document.body) =>
  [...within.querySelectorAll('button')].some(b => matches(text(b), name) || matches(b.getAttribute('aria-label') ?? '', name))

/** A <label>'s own words (its text nodes, not its control's options). */
const labelText = (l: Element | null) =>
  l
    ? [...l.childNodes]
        .filter(n => n.nodeType === Node.TEXT_NODE)
        .map(n => n.textContent)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
    : ''

/** The input, select or textarea labelled `name`: by aria-label, its <label>'s own words, or its placeholder. */
export function field<T extends HTMLElement = HTMLInputElement>(name: string | RegExp, within: ParentNode = document.body): T {
  const all = [...within.querySelectorAll<HTMLElement>('input, select, textarea')]
  const f =
    all.find(x => matches(x.getAttribute('aria-label') ?? '', name)) ??
    all.find(x => matches(labelText(x.closest('label') ?? (x.id ? document.querySelector(`label[for="${x.id}"]`) : null)), name)) ??
    // a check box whose label's words are in a <span> beside it
    all.find(x => x.tagName === 'INPUT' && !!x.closest('label') && matches(text(x.closest('label')!), name)) ??
    all.find(x => matches(x.getAttribute('placeholder') ?? '', name))
  if (!f) throw new Error(`no field ${name}`)
  return f as T
}

// (act's thenable doesn't chain: `act(...).then(f)` never waits for f, so each step is awaited on its own)
export async function click(e: Element) {
  await act(async () => (e as HTMLElement).click())
  await settle(2)
}

/** Type into an input or textarea, or choose a select's value, as React sees a user do it. */
export async function change(e: Element, value: string | boolean) {
  await act(async () => {
    if (e instanceof HTMLInputElement && (e.type === 'checkbox' || e.type === 'radio')) {
      if (e.checked !== value) e.click()
      return
    }
    const proto = e instanceof HTMLSelectElement ? HTMLSelectElement : e instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement
    Object.getOwnPropertyDescriptor(proto.prototype, 'value')!.set!.call(e, String(value))
    e.dispatchEvent(new Event(e instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })
  await settle(2)
}

/** A picker's match (role=option) whose text holds `name`. */
export function option(name: string | RegExp, within: ParentNode = document.body): HTMLElement {
  const o = [...within.querySelectorAll<HTMLElement>('[role=option]')].find(x => (typeof name === 'string' ? text(x).includes(name) : name.test(text(x))))
  if (!o) throw new Error(`no option ${name}; options: ${[...within.querySelectorAll('[role=option]')].map(text).join(' | ')}`)
  return o
}

/** The page's text, spaces collapsed. */
export const pageText = (within: Element = document.body) => text(within)

type Route = [RegExp, (url: string, init?: RequestInit) => unknown]
/** A server's saved files under /api/<api> (the runner and NPC stores: list, PUT with a new rev, DELETE), in memory.
 *  `files`: the root tag's id → file XML. Returns the route for stubFetch and the store. */
export function fakeStore(api: string, files: Record<string, string> = {}): { route: Route; rows: Map<string, { file: string; rev: number; xml: string }> } {
  const rows = new Map(Object.entries(files).map(([id, xml]) => [id, { file: `${id}.xml`, rev: 1, xml }]))
  const route: Route = [
    new RegExp(`/api/${api}(?:/([^/?]+))?(?:\\?.*)?$`),
    (url, init) => {
      const id = decodeURIComponent(url.match(new RegExp(`/api/${api}/([^/?]+)`))?.[1] ?? '')
      const method = init?.method ?? 'GET'
      if (method === 'GET') return [...rows.values()]
      if (method === 'DELETE') return rows.delete(id) ? {} : new Response('{"error":"gone"}', { status: 404 })
      const rev = (rows.get(id)?.rev ?? 0) + 1
      rows.set(id, { file: `${id}.xml`, rev, xml: String(init?.body) })
      return { rev, file: `${id}.xml` }
    },
  ]
  return { route, rows }
}

/** fetch answering each request from `routes` (first matching url pattern), else 404. Records every call. */
export function stubFetch(routes: Route[] = []) {
  const calls: { url: string; init?: RequestInit }[] = []
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    calls.push({ url, init })
    const hit = routes.find(([re]) => re.test(url))
    if (!hit) return new Response('not found', { status: 404 })
    const body = await hit[1](url, init)
    if (body instanceof Response) return body
    return typeof body === 'string'
      ? new Response(body, { status: 200, headers: { 'content-type': body.trimStart().startsWith('<') ? 'application/xml' : 'text/plain' } })
      : new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', f)
  return calls
}
