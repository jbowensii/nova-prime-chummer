// Background art: images the admin uploads, shown faintly behind every page (src/ui/Background.tsx). They live in
// library/backgrounds/<id>.<png|jpg|webp> with library/backgrounds/backgrounds.xml (backgrounds.xsd); the Library is
// never served as files, so they are read only through these routes. Shadowrun 6 has its own set, the same routes under
// /api/sr6/backgrounds in library/sr6/backgrounds/ (server.mjs makes one api per game, `libraryDir` being the game's). Who may call them: server/auth.mjs's role table
// (GET: anyone signed in; everything else: the admin). Writes are counted (server.mjs), so a restore refuses them.
//
//   GET    /api/backgrounds         -> { enabled: [id…] } (the admin also gets items: [{ id, name, enabled, uploaded, size }])
//   GET    /api/backgrounds/:id     the image (an enabled one; the admin: any), its own Content-Type, cached privately
//   POST   /api/backgrounds         admin, body: the image (image/png, image/jpeg or image/webp, X-Filename), 10 MB at most,
//                                   checked by its first bytes (SVG, HTML or anything else: 415); 50 images at most (409) -> 201 item
//   PUT    /api/backgrounds/:id     admin: { enabled } -> item
//   DELETE /api/backgrounds/:id     admin -> 204
//
// A game with a default (`seed`: Shadowrun 6's circuit board, server/defaults/sr6-circuit.webp) gets it in its gallery once,
// enabled, at its first request: the root's seeded="true" records that, so once the admin deletes or hides it, it stays so.
import { randomBytes } from 'node:crypto'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { attr, esc, safeName, writeAtomic } from './common.mjs'

const NS = 'urn:chummer-anarchy2:config:1'
export const MAX_IMAGE = 10 * 1024 * 1024,
  MAX_IMAGES = 50
const ID = /^[0-9a-f]{12}$/
const TYPES = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' }
const fail = (code, message) => Object.assign(new Error(message), { code })

/** The image type from its first bytes (png, jpg, webp), or null: the declared type is never trusted. */
export function sniff(b) {
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length >= 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp'
  return null
}

export function parseBackgrounds(xml) {
  return [...xml.matchAll(/<background\b[^>]*>/g)]
    .map(([t]) => ({
      id: attr(t, 'id'),
      type: attr(t, 'type'),
      name: attr(t, 'name') ?? '',
      enabled: attr(t, 'enabled') !== 'false',
      uploaded: attr(t, 'uploaded') ?? '',
      size: Number(attr(t, 'size') ?? 0),
    }))
    .filter(b => ID.test(b.id ?? '') && b.type in TYPES)
}
const backgroundsXml = (list, seeded) =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<!-- Background art (backgrounds.xsd). Written by the server. -->\n' +
  `<ca2:backgrounds xmlns:ca2="${NS}" version="1"${seeded ? ' seeded="true"' : ''}>\n${list
    .map(b => `  <background id="${b.id}" type="${b.type}" name="${esc(b.name)}" enabled="${b.enabled}" uploaded="${b.uploaded}" size="${b.size}"/>\n`)
    .join('')}</ca2:backgrounds>\n`

const newId = () => randomBytes(6).toString('hex')
const now = () => new Date().toISOString().replace(/\.\d+Z$/, 'Z')

/** `auth`: server/auth.mjs's api (its JSON body reader). `seed`: { file, name }, the game's default image (none: no default);
 *  `track`: books.track, so seeding is a counted write like any other (a restore waits for it; during one it waits). */
export function backgroundsApi({ libraryDir, auth, seed, track = fn => fn() }) {
  const dir = join(libraryDir, 'backgrounds'),
    path = join(dir, 'backgrounds.xml')
  const file = b => join(dir, `${b.id}.${b.type}`)
  const read = () =>
    readFile(path, 'utf8').catch(e => {
      if (e.code === 'ENOENT') return ''
      throw e
    })
  const load = async () => parseBackgrounds(await read())
  const save = async list => {
    await mkdir(dir, { recursive: true })
    await writeAtomic(path, backgroundsXml(list, !!seed))
  }
  let chain = Promise.resolve() // backgrounds.xml's read-modify-writes: one at a time
  const serial = fn => {
    const run = chain.then(fn)
    chain = run.catch(() => {})
    return run
  }
  // the default, once per gallery, after any images already there; a failure (a restore running) tries again next request
  let seeded = !seed
  const seeding = () =>
    seeded ||
    Promise.resolve()
      .then(() =>
        track(() =>
          serial(async () => {
            const xml = await read()
            if (!/<ca2:backgrounds\b[^>]*\bseeded="true"/.test(xml)) {
              const list = parseBackgrounds(xml)
              if (list.length < MAX_IMAGES) {
                const data = await readFile(seed.file)
                const b = { id: newId(), type: sniff(data), name: seed.name, enabled: true, uploaded: now(), size: data.length }
                await mkdir(dir, { recursive: true })
                await writeAtomic(file(b), data)
                list.push(b)
              }
              await save(list)
            }
            seeded = true
          }),
        ),
      )
      .catch(() => {})
  const item = ({ id, name, enabled, uploaded, size }) => ({ id, name, enabled, uploaded, size })

  async function body(req, res) {
    if (!/^image\/(png|jpeg|webp)\s*(;|$)/i.test(req.headers['content-type'] ?? '')) throw fail(415, 'only PNG, JPEG and WebP images can be uploaded')
    if (Number(req.headers['content-length']) > MAX_IMAGE) {
      res.setHeader('Connection', 'close')
      throw fail(413, 'the image is larger than 10 MB')
    }
    const chunks = []
    let size = 0
    for await (const c of req) {
      if ((size += c.length) > MAX_IMAGE) {
        res.setHeader('Connection', 'close')
        throw fail(413, 'the image is larger than 10 MB')
      }
      chunks.push(c)
    }
    return Buffer.concat(chunks)
  }

  /** The background routes; false for any other path. */
  async function handle(req, res, url, send, who) {
    const p = url.pathname
    if (p !== '/api/backgrounds' && !p.startsWith('/api/backgrounds/')) return false
    const m = p.match(/^\/api\/backgrounds(?:\/([^/]+))?$/)
    if (!m) return send(res, 404, { error: 'not found' })
    const id = m[1]
    if (id != null && !ID.test(id)) return send(res, 400, { error: 'bad image id' })
    const want = id == null ? ['GET', 'POST'] : ['GET', 'PUT', 'DELETE']
    if (!want.includes(req.method)) return send(res, 405, { error: 'method not allowed' })
    const admin = who.role === 'admin'
    await seeding()

    if (req.method === 'GET' && id == null) {
      const list = await load()
      return send(res, 200, { enabled: list.filter(b => b.enabled).map(b => b.id), ...(admin ? { items: list.map(item) } : {}) })
    }
    if (req.method === 'GET') {
      const b = (await load()).find(x => x.id === id && (x.enabled || admin))
      const data = b && (await readFile(file(b)).catch(() => null))
      if (!data) return send(res, 404, { error: 'no such image' })
      // an id is never reused, so its bytes never change; private: only signed-in browsers have it
      res.writeHead(200, { 'Content-Type': TYPES[b.type], 'Content-Length': data.length, 'Cache-Control': 'private, max-age=86400' })
      return res.end(data)
    }
    if (req.method === 'POST') {
      const data = await body(req, res),
        type = sniff(data)
      if (!type) throw fail(415, 'this file isn’t a PNG, JPEG or WebP image')
      const name = req.headers['x-filename'] ? safeName(req.headers['x-filename']) : 'image'
      return serial(async () => {
        const list = await load()
        if (list.length >= MAX_IMAGES) throw fail(409, `${MAX_IMAGES} images at most: delete one first`)
        const b = { id: newId(), type, name, enabled: true, uploaded: now(), size: data.length }
        await mkdir(dir, { recursive: true })
        await writeAtomic(file(b), data)
        list.push(b)
        await save(list)
        return send(res, 201, item(b))
      })
    }
    const b0 = req.method === 'PUT' ? await auth.json(req) : null
    return serial(async () => {
      const list = await load(),
        b = list.find(x => x.id === id)
      if (!b) throw fail(404, 'no such image')
      if (req.method === 'DELETE') {
        list.splice(list.indexOf(b), 1)
        await save(list)
        await rm(file(b), { force: true })
        return send(res, 204, '', 'text/plain')
      }
      if (typeof b0?.enabled !== 'boolean') throw fail(400, 'body is { enabled: true or false }')
      b.enabled = b0.enabled
      await save(list)
      return send(res, 200, item(b))
    })
  }

  return { handle }
}
