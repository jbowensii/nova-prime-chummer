// The Setup screen's API (Phase 2; docs/plans/desktop-app-foundry-model-2026-10-22.md). Admin only (server/auth.mjs need()).
//   GET /api/setup-config   -> { file, version, desktop, settings: [{ key, type, value, source, later }], systems, backups, cloud: { configured, error? } }
//   PUT /api/setup-config/systems/<disk>/enabled { enabled } and POST .../systems/<disk>/install (zip body, or JSON { url }) -> systems (server/systems.mjs)
//   PUT /api/setup-config   { set: { key: value|null }, reset: [key] } -> the same. Writes <Config>/options.json only: the path is
//                           fixed, the keys are a whitelist, each value is checked by type. null turns a setting off (Foundry's rule).
// Backups, restore and download are the existing /api/backup and /api/restore (server/backup.mjs).
import { mkdir, readFile, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { configSources, resolveOpts } from './config.mjs'
import { fail, writeAtomic } from './common.mjs'
import { loadS3Config } from './s3.mjs'
import { systemsApi } from './systems.mjs'

const str = v => typeof v === 'string' && v.length <= 500 && ![...v].some(c => c < ' ')
const flagOf = v => typeof v === 'boolean'
// type: how the UI edits it. later: stored only, nothing reads it yet (ssl/proxy/upnp: a later phase).
const SPEC = {
  hostname: { type: 'text', ok: str, later: true },
  routePrefix: { type: 'text', ok: v => str(v) && /^\/[\w./-]*$/.test(v) && !v.includes('..'), later: true },
  sslCert: { type: 'text', ok: str, later: true },
  sslKey: { type: 'text', ok: str, later: true },
  proxySSL: { type: 'bool', ok: flagOf, later: true },
  proxyPort: { type: 'number', ok: v => Number.isInteger(v) && v >= 1 && v <= 65535, later: true },
  upnp: { type: 'bool', ok: flagOf, later: true },
  dataPath: { type: 'text', readonly: true }, // set by the installer/launcher; shown, never written here
  awsConfig: { type: 'text', ok: str }, // the S3 settings file (server/s3.mjs); its secret never comes through here
  language: { type: 'text', ok: v => typeof v === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(v), later: true },
  updateChannel: { type: 'choice', ok: v => v === 'stable' || v === 'testing', options: ['stable', 'testing'] },
  compressStatic: { type: 'bool', ok: flagOf, later: true },
  telemetry: { type: 'bool', ok: flagOf, later: true },
}
const STAMP = /^\d{8}T\d{6}_\d{6}Z\.zip$/ // importer/backup.py's safety backups

/** layout, version (app), cliArgs/env (the flag and env layers), readJson(req) (server.mjs), desktop (first-run admin on screen). */
export function setupApi({ layout, version, cliArgs = [], env = process.env, readJson, desktop = false }) {
  const file = join(layout.config, 'options.json')
  const sys = systemsApi({ layout, version })

  async function readOpts() {
    let text
    try {
      text = await readFile(file, 'utf8')
    } catch (e) {
      if (e.code === 'ENOENT') return {}
      throw e
    }
    let v
    try {
      v = JSON.parse(text)
    } catch {
      v = null
    }
    // never overwrite a file we can't read: the owner's hand edit would be lost
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw fail(409, 'Config/options.json isn’t a JSON object; fix or remove it first')
    return v
  }

  async function backups() {
    const out = []
    for (const name of await readdir(layout.backups).catch(() => [])) {
      if (!STAMP.test(name)) continue
      const s = await stat(join(layout.backups, name)).catch(() => null)
      if (s?.isFile()) out.push({ name, bytes: s.size, created: s.mtime.toISOString() })
    }
    return out.sort((a, b) => b.name.localeCompare(a.name))
  }

  /** The S3 settings file's path (awsConfig, any layer), null when none. */
  const awsConfigPath = async () => resolveOpts(cliArgs, env, await readOpts()).awsConfig ?? null
  /** Only whether it loads: never the file's contents. */
  async function cloud() {
    try {
      await loadS3Config(await awsConfigPath())
      return { configured: true }
    } catch (e) {
      return { configured: false, error: e.message }
    }
  }

  async function view() {
    const opts = await readOpts()
    const eff = resolveOpts(cliArgs, env, opts)
    const src = configSources(cliArgs, env, opts)
    return {
      file,
      version,
      desktop,
      settings: Object.entries(SPEC).map(([key, s]) => ({
        key,
        type: s.type,
        options: s.options,
        value: eff[key],
        source: src[key],
        later: !!s.later,
        readonly: !!s.readonly,
      })),
      systems: await sys.list(),
      backups: await backups(),
      cloud: await cloud(),
    }
  }

  async function save(req) {
    const b = await readJson(req)
    const set = b.set ?? {},
      reset = b.reset ?? []
    if (typeof set !== 'object' || Array.isArray(set) || set === null || !Array.isArray(reset)) throw fail(400, 'send { set: {…}, reset: […] }')
    for (const k of [...Object.keys(set), ...reset]) if (!Object.hasOwn(SPEC, k)) throw fail(400, `unknown setting ${String(k).slice(0, 40)}`)
    for (const k of [...Object.keys(set), ...reset]) if (SPEC[k].readonly) throw fail(400, `${k} is read-only`)
    for (const [k, v] of Object.entries(set)) if (v !== null && !SPEC[k].ok(v)) throw fail(400, `${k}: not a valid value`) // null: off
    const opts = await readOpts()
    for (const k of reset) delete opts[k]
    Object.assign(opts, set)
    await mkdir(layout.config, { recursive: true })
    await writeAtomic(file, JSON.stringify(opts, null, 2) + '\n', 0o600)
    return view()
  }

  /** The Setup routes; false for any other path. */
  async function handle(req, res, url, send) {
    const m = /^\/api\/setup-config\/systems\/([a-z0-9]+)\/(enabled|install)$/.exec(url.pathname)
    if (m) {
      if (m[2] === 'enabled' && req.method === 'PUT') return send(res, 200, await sys.setEnabled(m[1], (await readJson(req)).enabled))
      if (m[2] === 'install' && req.method === 'POST') {
        if (/^application\/json/.test(req.headers['content-type'] ?? '')) return send(res, 200, await sys.installUrl(m[1], (await readJson(req)).url))
        if (Number(req.headers['content-length']) > sys.MAX_ZIP) {
          res.setHeader('Connection', 'close')
          return send(res, 413, { error: 'the package is larger than 200 MB' })
        }
        const chunks = []
        let size = 0
        for await (const c of req) if ((size += c.length) <= sys.MAX_ZIP) chunks.push(c)
        if (size > sys.MAX_ZIP) return send(res, 413, { error: 'the package is larger than 200 MB' })
        return send(res, 200, await sys.install(m[1], Buffer.concat(chunks)))
      }
      return send(res, 405, { error: 'method not allowed' })
    }
    if (url.pathname !== '/api/setup-config') return false
    if (req.method === 'GET') return send(res, 200, await view())
    if (req.method === 'PUT') return send(res, 200, await save(req))
    return send(res, 405, { error: 'method not allowed' })
  }
  return { handle, awsConfigPath }
}
