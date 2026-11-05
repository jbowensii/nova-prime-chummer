// Resolves the server's options: CLI flag, then env var, then options.json, then the default.
// Every env var the Docker image sets (STATIC_DIR, CHAR_DIR, CUSTOM_DIR, LIBRARY_DIR, PYTHON, PORT, TRUST_PROXY, PUBLIC_URL)
// is still the env layer, so a server with only those set resolves exactly as before.
// charDir / customDir / libraryDir are the OLD layout's three folders. The live server ignores them (it runs on
// dataPath, server/layout.mjs); they are resolved so the migrator (server/migrate.mjs) can find an old tree.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

// name: [CLI flag, env var]
const KEYS = {
  host: ['--host', 'BIND_HOST'],
  port: ['--port', 'PORT'],
  dataPath: ['--data-path', 'DATA_PATH'],
  charDir: ['--char-dir', 'CHAR_DIR'],
  customDir: ['--custom-dir', 'CUSTOM_DIR'],
  libraryDir: ['--library-dir', 'LIBRARY_DIR'],
  python: ['--python', 'PYTHON'],
  staticDir: ['--static-dir', 'STATIC_DIR'],
  trustProxy: ['--trust-proxy', 'TRUST_PROXY'],
  publicUrl: ['--public-url', 'PUBLIC_URL'],
  // Phase 2 settings (docs/plans/desktop-app-foundry-model-2026-10-22.md). Resolved and stored only: nothing reads
  // hostname/routePrefix/sslCert/sslKey/proxySSL/proxyPort/upnp/compressStatic/telemetry yet. Env names avoid the shell's own HOSTNAME and LANGUAGE.
  hostname: ['--hostname', 'APP_HOSTNAME'],
  routePrefix: ['--route-prefix', 'ROUTE_PREFIX'],
  sslCert: ['--ssl-cert', 'SSL_CERT'],
  sslKey: ['--ssl-key', 'SSL_KEY'],
  proxySSL: ['--proxy-ssl', 'PROXY_SSL'],
  proxyPort: ['--proxy-port', 'PROXY_PORT'],
  upnp: ['--upnp', 'UPNP'],
  awsConfig: ['--aws-config', 'AWS_CONFIG'],
  language: ['--language', 'APP_LANGUAGE'],
  updateChannel: ['--update-channel', 'UPDATE_CHANNEL'],
  compressStatic: ['--compress-static', 'COMPRESS_STATIC'],
  telemetry: ['--telemetry', 'TELEMETRY'],
}

/** `--name value` or `--name=value` from argv; undefined when absent. */
function flag(argv, name) {
  // last occurrence wins, so `--port 80 "$@"` lets a user's trailing --port override the default
  for (let i = argv.length - 1; i >= 0; i--) {
    if (argv[i] === name) return argv[i + 1]
    if (argv[i].startsWith(`${name}=`)) return argv[i].slice(name.length + 1)
  }
}

export function resolveConfig(argv = [], env = {}) {
  const file = flag(argv, '--config') ?? env.CONFIG ?? 'options.json'
  let opts = {}
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) opts = parsed // a null/array/scalar config is ignored, not crashed on
  } catch (e) {
    // a missing default file is fine; a config the user named that is missing or broken is not
    if (file !== 'options.json' || e.code !== 'ENOENT') throw new Error(`cannot read config ${file}: ${e.message}`, { cause: e })
  }
  return resolveOpts(argv, env, opts)
}

/** The same resolution over an already-read options object (Setup shows the effective values without touching cwd's file). */
export function resolveOpts(argv, env, opts) {
  const get = k => flag(argv, KEYS[k][0]) ?? env[KEYS[k][1]] ?? opts[k]
  // Foundry's semantics for the Setup-screen settings: null (JSON null, or the text "null" from a flag or env var) turns the
  // setting off, and stays off instead of falling through to the default. A key that is absent takes the default.
  const setting = (k, dflt, as = v => v) => {
    const v = flag(argv, KEYS[k][0]) ?? env[KEYS[k][1]] ?? (k in opts ? opts[k] : undefined)
    if (v === undefined || v === '') return dflt
    return v === null || v === 'null' ? null : as(v)
  }
  const bool = v => (typeof v === 'string' ? /^(1|true|yes|on)$/i.test(v) : !!v)
  const num = v => (Number.isFinite(Number(v)) ? Number(v) : null)
  const dataPath = get('dataPath')
  const port = Number(get('port') ?? 80) // a non-numeric port would crash listen; fall back to the default
  const dir = (k, sub, dflt) => get(k) ?? (dataPath ? join(dataPath, sub) : dflt)
  return {
    host: get('host') || undefined, // unset: listen on all interfaces, as the Docker image does
    port: Number.isFinite(port) ? port : 80,
    staticDir: get('staticDir') ?? new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    dataPath: dataPath || '/data', // the one root of the live layout: Config, Data, Library, Logs, Backups (server/layout.mjs)
    charDir: dir('charDir', 'characters', '/data/characters'),
    customDir: dir('customDir', 'custom', '/data/custom'),
    libraryDir: dir('libraryDir', 'library', '/data/library'),
    python: get('python') ?? 'python3',
    trustProxy: get('trustProxy') ?? '', // comma-separated IPs or CIDRs of the reverse proxy
    publicUrl: get('publicUrl') ?? '', // the app's one public address (Origin check, Authelia redirect URI)
    hostname: setting('hostname', null), // the public name in links
    routePrefix: setting('routePrefix', null), // serve under a sub-path
    sslCert: setting('sslCert', null),
    sslKey: setting('sslKey', null),
    proxySSL: setting('proxySSL', false, bool), // behind a TLS reverse proxy
    proxyPort: setting('proxyPort', null, num),
    upnp: setting('upnp', false, bool), // present, off: used when remote access arrives
    awsConfig: setting('awsConfig', null), // path to the S3 settings file
    language: setting('language', 'en'),
    updateChannel: setting('updateChannel', 'stable', v => (['stable', 'testing'].includes(String(v).toLowerCase()) ? String(v).toLowerCase() : 'stable')),
    compressStatic: setting('compressStatic', true, bool),
    telemetry: setting('telemetry', false, bool), // off; nothing in the server sends anything
  }
}

/** Where each Phase 2 setting's effective value comes from: flag, env, file (a key present in options.json, null included) or default. */
export function configSources(argv, env, opts) {
  const src = {}
  for (const [k, [f, e]] of Object.entries(KEYS)) src[k] = flag(argv, f) !== undefined ? 'flag' : (env[e] ?? '') !== '' ? 'env' : k in opts ? 'file' : 'default'
  return src
}
