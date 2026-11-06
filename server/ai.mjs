// The Books API's AI, each game its own (the same routes, also under /api/sr6/): the provider settings and keys, the model
// list and the connection test, and Ask the rules with each account's daily count. Routes and roles: server/books.mjs.
import { readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { CONFIG_NS, attr, body, clean, fail, readOr, rootTag, serializer, unesc, writeAtomic } from './common.mjs'

const PROVIDERS = ['anthropic', 'openai', 'gemini', 'anythingllm', 'ollama', 'lmstudio', 'compatible', 'openrouter', 'mistral', 'azure']
const KEYLESS = ['openai', 'ollama', 'lmstudio', 'compatible'] // importer/ai/providers.py KEYLESS: a local server may need no key
const DEFAULT_ADDRESS = ['ollama', 'lmstudio'] // they have a usual address, so none typed is fine
/** The 429 when an account's daily questions for the game are used up (limit 0: it has none). */
export const limitReached = n =>
  n === 0 ? 'You have no questions today.' : `${n === 1 ? 'You’ve used today’s question.' : `You’ve used all ${n} of today’s questions.`} Ask again tomorrow.`
const MAX_QUESTION = 500 // importer/ask.py MAX_QUESTION; its provider call gives up at 50 s, the server's askTimeout (60 s) stops it
const ASK_AT_ONCE = 3 // questions being answered on the whole server (each is a Python process)

/** ctx (books.mjs): AREAS, config, askTimeout and the importer (jobs.mjs). */
export function aiApi(ctx) {
  const { AREAS, config, askTimeout } = ctx
  const { importer, redact, aiConfig } = ctx
  // key writes (read-modify-write in the importer) and the ask counts: each one at a time
  const serial = serializer()
  let listChain = Promise.resolve() // model lists: one at a time, so repeated clicks can't pile up processes
  let testing = null
  const tests = [] // connection tests: one at a time, 10 a minute (each may cost a few tokens)

  async function aiSettings(game = 'ca2') {
    const xml = (await readOr(join(aiConfig(game), 'ai-providers.xml'), `<ca2:aiproviders xmlns:ca2="${CONFIG_NS}" version="1"/>`))
      .replace(/^\s*<\?xml[^>]*\?>\s*/, '')
      .trim()
    const keys = await readOr(join(aiConfig(game), 'ai-keys.xml'), '')
    const set = p => new RegExp(`<key\\s+provider="${p}"\\s*>\\s*[^<\\s]`).test(keys)
    const summary = PROVIDERS.map(p => `  <key provider="${p}" set="${set(p)}"/>\n`).join('')
    const out =
      /\/>$/.test(xml) && !/<\/ca2:aiproviders>$/.test(xml)
        ? xml.replace(/\s*\/>$/, `>\n${summary}</ca2:aiproviders>`)
        : xml.replace(/<\/ca2:aiproviders>$/, `${summary}</ca2:aiproviders>`)
    return `<?xml version="1.0" encoding="UTF-8"?>\n${out}\n`
  }

  // never log or echo this route's body: it holds API keys
  async function putKeys(req, game = 'ca2') {
    const text = await body(req, 64 * 1024)
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw fail(400, 'bad keys document')
    const keys = [...text.matchAll(/<key\s+provider="([a-z]+)"\s*(?:\/>|>([^<]*)<\/key>)/g)].filter(m => PROVIDERS.includes(m[1]))
    if (!keys.length) throw fail(400, 'no <key provider="…"> for a known provider')
    for (const [, provider, value = ''] of keys) await setKey(provider, unesc(value).trim(), game)
  }

  function setKey(provider, value, game) {
    return serial('key', async () => {
      await mkdir(AREAS[game].ai, { recursive: true })
      const r = await importer(['set-key', AREAS[game].ai, provider], { input: value, timeout: 30000 })
      if (r.code !== 0) throw fail(500, 'couldn’t store the key: ' + (await redact(r.err)).trim().split('\n').pop())
    })
  }

  /** Save ai-providers.xml through the importer: the parser that later reads the file for a call is the one that
   *  checks it and compares base URLs (a provider whose address changed has its key cleared first; a key is only
   *  sent to the address it was entered for). Queued with the key writes, which it may make. */
  function putSettings(xml, game = 'ca2') {
    return serial('key', async () => {
      await mkdir(AREAS[game].ai, { recursive: true })
      const r = await importer(['set-settings', '--library', AREAS[game].ai], { input: xml, timeout: 30000 })
      const why = (await redact(r.err)).trim().split('\n').pop()
      if (r.code === 3) throw fail(400, why || 'these aren’t provider settings')
      const out = rootTag(r.out, 'result')
      if (r.code !== 0 || !out) throw fail(500, 'couldn’t save the settings: ' + why)
      return (attr(out, 'cleared') ?? '').split(' ').filter(Boolean)
    })
  }

  /** The provider's model ids. Read-only, so outside the job queue and the key chain but one at a time; the importer
   *  reads the saved address before the key, and only the provider id comes from the request. */
  async function listModels(provider, game = 'ca2') {
    if (!PROVIDERS.includes(provider)) throw fail(400, 'unknown provider')
    const run = listChain.then(() => importer(['list-models', provider, '--library', AREAS[game].ai], { timeout: 60000 }))
    listChain = run
    const r = await run
    if (r.code === 0)
      return r.out
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
    const why = (await redact(r.err)).trim().split('\n').pop()
    throw fail(502, r.code === 3 && why ? why : 'the importer couldn’t ask the provider' + (why ? `: ${why}` : ''))
  }

  /** Is the provider connected? `importer test-ai`: the saved address, model and key, a tiny fixed prompt. */
  async function testProvider(provider, game = 'ca2') {
    if (!PROVIDERS.includes(provider)) throw fail(400, 'unknown provider')
    if (testing) throw Object.assign(fail(429, 'a connection test is already running; wait for it'), { retryAfter: 5 })
    const now = Date.now()
    while (tests.length && tests[0] < now - 60000) tests.shift()
    if (tests.length >= 10)
      throw Object.assign(fail(429, 'that’s 10 tests in a minute; wait a moment'), { retryAfter: Math.ceil((tests[0] + 60000 - now) / 1000) })
    tests.push(now)
    testing = importer(['test-ai', provider, '--library', AREAS[game].ai], { timeout: 30000 })
    const r = await testing.finally(() => {
      testing = null
    })
    if (r.signal) throw fail(502, 'no answer within 30 seconds')
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code !== 0) throw fail(502, r.code === 3 && why ? why : 'the importer couldn’t ask the provider' + (why ? `: ${why}` : ''))
    let out
    try {
      out = JSON.parse(r.out.trim().split('\n').pop())
    } catch {
      throw fail(502, 'the importer’s answer couldn’t be read')
    }
    const text = s =>
      String(s ?? '')
        // eslint-disable-next-line no-control-regex -- the reply is shown as one line of text: control characters become spaces
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .trim()
    return { ok: true, model: text(out.model).slice(0, 120), reply: (await redact(text(out.reply))).slice(0, 200), ms: Math.round(Number(out.ms) || 0) }
  }

  // ---- Ask the rules ----
  const asking = new Set() // user ids with a question being answered
  const countsPath = join(config, 'ask-counts.xml')
  const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10)
  /** Today's answered questions per game and user id (key: the id, SR6's prefixed `sr6:`, so a count saved before the
   *  split, with no game, stays Anarchy's); ask-counts.xml (users.xsd askcounts) keeps them over a restart. */
  const askKey = (id, game) => (game === 'sr6' ? `sr6:${id}` : id)
  let asked = { day: utcDay(), n: new Map() }
  try {
    const xml = readFileSync(countsPath, 'utf8')
    if (attr(rootTag(xml, 'ca2:askcounts'), 'date') === asked.day)
      for (const [m] of xml.matchAll(/<count\b[^>]*>/g))
        if (/^[0-9a-f]{12}$/.test(attr(m, 'user') ?? '')) asked.n.set(askKey(attr(m, 'user'), attr(m, 'game')), Number(attr(m, 'n')) || 0)
  } catch {
    /* none yet */
  }
  const usedToday = (id, game) => {
    if (asked.day !== utcDay()) asked = { day: utcDay(), n: new Map() }
    return asked.n.get(askKey(id, game)) ?? 0
  }
  const saveCounts = () =>
    serial('ask', () =>
      writeAtomic(
        countsPath,
        `<?xml version="1.0" encoding="UTF-8"?>\n<ca2:askcounts xmlns:ca2="${CONFIG_NS}" version="1" date="${
          asked.day
        }">\n${[...asked.n].map(([k, n]) => `  <count user="${k.replace('sr6:', '')}"${k.startsWith('sr6:') ? ' game="sr6"' : ''} n="${n}"/>\n`).join('')}</ca2:askcounts>\n`,
      ),
    ).catch(e => console.error(`couldn’t save ask-counts.xml: ${e.message}`))

  /** Is an AI provider chosen, enabled and given its key (an OpenAI-compatible server may need none, but an address)? */
  async function askAvailable(game = 'ca2') {
    const xml = await readOr(join(aiConfig(game), 'ai-providers.xml'), '')
    const use = attr(rootTag(xml, 'ca2:aiproviders'), 'use')
    const p = use && [...xml.matchAll(/<provider\b[^>]*>/g)].map(m => m[0]).find(t => attr(t, 'id') === use)
    if (!p || attr(p, 'enabled') !== 'true') return false
    const key = new RegExp(`<key\\s+provider="${use}"\\s*>\\s*[^<\\s]`).test(await readOr(join(aiConfig(game), 'ai-keys.xml'), ''))
    return key || (KEYLESS.includes(use) && (!!attr(p, 'baseUrl') || DEFAULT_ADDRESS.includes(use)))
  }

  async function ask(req, who, game = 'ca2') {
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) throw fail(415, 'send { question } as application/json')
    let question, scope
    try {
      ;({ question, scope } = JSON.parse(await body(req, 8192)) ?? {})
    } catch (e) {
      throw e.code === 413 ? e : fail(400, 'send { question } as JSON')
    }
    question = typeof question === 'string' ? clean(question).replace(/\s+/g, ' ').trim() : ''
    if (!question || question.length > MAX_QUESTION) throw fail(400, `a question is 1–${MAX_QUESTION} characters`)
    if (!(await askAvailable(game)))
      throw fail(409, `Ask the rules isn’t set up${game === 'sr6' ? ' for Shadowrun 6' : ''}: the admin chooses an AI provider and its key in AI settings`)
    if (asking.has(who.id)) throw Object.assign(fail(429, 'your last question is still being answered; wait for it'), { retryAfter: 5 })
    if (asking.size >= ASK_AT_ONCE) throw Object.assign(fail(429, 'Ask the rules is busy; try again in a moment'), { retryAfter: 5 })
    const limit = who.dailyQuestions ?? null
    if (limit != null && usedToday(who.id, game) >= limit)
      throw Object.assign(fail(429, limitReached(limit)), { retryAfter: Math.ceil((Date.parse(`${utcDay()}T00:00:00Z`) + 86400e3 - Date.now()) / 1000) })
    asking.add(who.id)
    let r
    try {
      const area = AREAS[game]
      r = await importer([...area.pre, 'ask', '--custom', area.custom, '--library', area.ai, ...(scope === 'rules' ? ['--scope', 'rules'] : [])], {
        input: question,
        timeout: askTimeout,
      })
    } finally {
      asking.delete(who.id)
    }
    console.log(`ask${game === 'sr6' ? ' (sr6)' : ''}: ${who.username} at ${new Date().toISOString()}`) // never the question or the answer
    let out = null
    try {
      out = JSON.parse(r.out.trim().split('\n').pop())
    } catch {
      /* killed or crashed: no JSON */
    }
    // counted unless the importer says it never asked the provider (a timeout or a crash counts: it may have)
    if (out?.called !== false) {
      const n = usedToday(who.id, game) + 1 // first: at midnight this rolls the day over, and the count goes in the new one
      asked.n.set(askKey(who.id, game), n)
      await saveCounts()
    }
    if (r.signal) throw fail(502, `no answer within ${askTimeout / 1000} seconds; try again`)
    const why = (await redact(r.err)).trim().split('\n').pop()
    if (r.code !== 0 && out?.provider) {
      // the provider's own words are the admin's: the log, and AI settings' Test
      console.error(`ask${game === 'sr6' ? ' (sr6)' : ''}: the AI provider failed: ${why}`)
      throw fail(502, 'the AI provider isn’t answering; tell the admin')
    }
    if (r.code !== 0) throw fail(502, r.code === 3 && why ? why : 'the importer couldn’t answer' + (why ? `: ${why}` : ''))
    if (!out) throw fail(502, 'the importer’s answer couldn’t be read')
    const text = s => String(s ?? '').slice(0, 200)
    const sources = (Array.isArray(out.sources) ? out.sources : [])
      .slice(0, 8)
      .map(s => ({ source: text(s?.source), page: text(s?.page), title: text(s?.title), kind: text(s?.kind), id: text(s?.id) }))
    return { answer: (await redact(String(out.answer ?? ''))).slice(0, 6000), sources, covered: out.covered === true, used: usedToday(who.id, game), limit }
  }

  /** The game's AI: its settings, keys, model list and test, and Ask the rules (the same routes for both games); false: not one. */
  async function ai(req, res, url, send, who, game = 'ca2') {
    const p = url.pathname,
      method = req.method
    if (p === '/api/ai-settings' && method === 'GET') return send(res, 200, await aiSettings(game), 'application/xml; charset=utf-8')
    if (p === '/api/ai-settings' && method === 'PUT') {
      const cleared = await putSettings(await body(req), game)
      return send(res, 200, cleared.length ? { cleared, message: 'Key cleared because the address changed — enter it again' } : { cleared })
    }
    if (p === '/api/ai-test' && method === 'POST') return send(res, 200, await testProvider(url.searchParams.get('provider') ?? '', game))
    if (p === '/api/ai-models' && method === 'GET') {
      const provider = url.searchParams.get('provider') ?? '',
        ids = await listModels(provider, game)
      return send(
        res,
        200,
        provider === 'anythingllm' // the importer prints slug<TAB>name
          ? { workspaces: ids.map(l => ({ slug: l.split('\t')[0], name: l.slice(l.indexOf('\t') + 1) })) }
          : { models: ids },
      )
    }
    if (p === '/api/ask' && method === 'GET')
      return send(res, 200, { available: await askAvailable(game), limit: who.dailyQuestions ?? null, used: usedToday(who.id, game) })
    if (p === '/api/ask' && method === 'POST') return send(res, 200, await ask(req, who, game))
    if (p === '/api/ask') return send(res, 405, { error: 'method not allowed' })
    if (p === '/api/ai-keys' && method === 'PUT') {
      await putKeys(req, game)
      return send(res, 204, '', 'text/plain')
    }
    return false
  }

  return { ai }
}
