// Resolves the server's options: CLI flag, then env var, then options.json, then the default.
// Every env var the Docker image sets (STATIC_DIR, CHAR_DIR, CUSTOM_DIR, LIBRARY_DIR, PYTHON, PORT, TRUST_PROXY, PUBLIC_URL)
// is still the env layer, so a server with only those set resolves exactly as before.
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
    if (file !== 'options.json' || e.code !== 'ENOENT') throw new Error(`cannot read config ${file}: ${e.message}`)
  }
  const get = k => flag(argv, KEYS[k][0]) ?? env[KEYS[k][1]] ?? opts[k]
  const dataPath = get('dataPath')
  const port = Number(get('port') ?? 80) // a non-numeric port would crash listen; fall back to the default
  const dir = (k, sub, dflt) => get(k) ?? (dataPath ? join(dataPath, sub) : dflt)
  return {
    host: get('host') || undefined, // unset: listen on all interfaces, as the Docker image does
    port: Number.isFinite(port) ? port : 80,
    staticDir: get('staticDir') ?? new URL('../dist', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'),
    charDir: dir('charDir', 'characters', '/data/characters'),
    customDir: dir('customDir', 'custom', '/data/custom'),
    libraryDir: dir('libraryDir', 'library', '/data/library'),
    python: get('python') ?? 'python3',
    trustProxy: get('trustProxy') ?? '', // comma-separated IPs or CIDRs of the reverse proxy
    publicUrl: get('publicUrl') ?? '', // the app's one public address (Origin check, Authelia redirect URI)
  }
}
