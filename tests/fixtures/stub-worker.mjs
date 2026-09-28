// Stand-in for `python -m importer …` in server tests and e2e (no Python in CI). Invoked as
// `node stub-worker.mjs -m importer <command> …`. It fakes each command's files just enough for the
// server's routes and the app: status.xml, import.xml, a one-entry overlay listed in
// custom/imported/index.xml and sources.xml, review.xml, ai-keys.xml.
// Markers in the uploaded bytes: "needs-ai" → no recipe matched; "crash" → exit 1 with a key on stderr.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const [, , , , cmd, target, ...rest] = process.argv
const opt = name => rest[rest.indexOf(name) + 1]
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const status = (dir, state, msg = '') => writeFileSync(join(dir, 'status.xml'), `<status state="${state}" updated="${now}">${msg}</status>\n`)
const importXml = (dir, attrs = '', files = '') =>
  writeFileSync(join(dir, 'import.xml'), `<import file="stub.pdf" sha256="00" converter="stub" pages="1" score="1.00"${attrs}><files>${files}</files><report/></import>\n`)
const NS = 'xmlns:ca2="urn:chummer-anarchy2:data:1"'

/** custom/imported/index.xml lists every source folder's overlay files; sources.xml gains or loses `src`. */
function sync(custom, src, add) {
  const imp = join(custom, 'imported')
  mkdirSync(imp, { recursive: true })
  const files = readdirSync(imp, { withFileTypes: true }).filter(d => d.isDirectory())
    .flatMap(d => readdirSync(join(imp, d.name)).filter(f => f.endsWith('.xml')).map(f => `${d.name}/${f}`)).sort()
  writeFileSync(join(imp, 'index.xml'), `<overlays>\n${files.map(f => `  <file href="${f}"/>\n`).join('')}</overlays>\n`)
  const path = join(imp, 'sources.xml')
  const old = existsSync(path) ? readFileSync(path, 'utf8') : `<ca2:data ${NS} kind="sources" version="1">\n</ca2:data>\n`
  const without = old.replace(new RegExp(`  <source id="${src}"[\s\S]*?</source>\n`), '')
  writeFileSync(path, add ? without.replace('</ca2:data>', `  ${add}\n</ca2:data>`) : without)
}
const overlay = (custom, src, name, entries) => {
  mkdirSync(join(custom, 'imported', src.toLowerCase()), { recursive: true })
  writeFileSync(join(custom, 'imported', src.toLowerCase(), 'amps.xml'), `<ca2:data ${NS} kind="amps" version="1">${entries}</ca2:data>\n`)
  sync(custom, src, `<source id="${src}" publisher="Stub" canon="false" file="stub.pdf" sha256="00" imported="2026-09-28"><name>${name}</name></source>`)
}

if (cmd === 'run') {
  const pdf = readFileSync(join(target, 'original.pdf'), 'latin1')
  if (pdf.includes('crash')) {
    process.stderr.write('Traceback: boom, key sk-ant-SECRETSTUBKEY123\n')
    process.exit(1)
  }
  if (pdf.includes('needs-ai')) {
    writeFileSync(join(target, 'book.md'), '# Stub\n')
    importXml(target)
    status(target, 'needs-ai', 'no recipe matched this book')
  } else {
    overlay(opt('--custom'), 'STUB', 'Stub Book', '<amp id="stub.stub-amp" type="quality" source="STUB" page="1"><name>Stub Amp</name></amp>')
    importXml(target, ' recipe="stub" source="STUB" name="Stub Book" publisher="Stub" canon="false" imported="2026-09-28T00:00:00+00:00"',
      '<file name="amps.xml" entries="1"/>')
    status(target, 'done')
  }
} else if (cmd === 'remove') {
  const src = readFileSync(join(target, 'import.xml'), 'utf8').match(/source="([^"]+)"/)?.[1]
  if (src) {
    rmSync(join(opt('--custom'), 'imported', src.toLowerCase()), { recursive: true, force: true })
    sync(opt('--custom'), src, null)
  }
  if (rest.includes('--files')) rmSync(target, { recursive: true, force: true })
  else { importXml(target); status(target, 'removed') }
} else if (cmd === 'propose') {
  if (rest.includes('--dry-run')) console.log('<result parts="4" provider="anthropic" />')
  else {
    writeFileSync(join(target, 'review.xml'), `<review book="${basename(target)}" source="X" provider="anthropic" created="${now}" bookSha256="00" parts="4" done="4">
  <proposal id="amp.a" kind="amp" state="pending" page="3"><amp id="a" type="quality" printedRating="0" source="X" page="3"><name>Lucky Charm</name><narrative></narrative></amp></proposal>
  <proposal id="gear.tin-spoon" kind="gear" state="pending" page="4"><item id="tin-spoon" kind="gear" source="X" page="4"><name>Tin Spoon</name><text></text></item><note>no price given</note></proposal>
</review>\n`)
    status(target, 'review', '2 proposals to review')
  }
} else if (cmd === 'apply-review') {
  const src = opt('--source'), review = readFileSync(join(target, 'review.xml'), 'utf8')
  const amps = [...review.matchAll(/<proposal\b[^>]*state="(?:accepted|edited)"[^>]*>\s*(<amp\b[\s\S]*?<\/amp>)/g)]
    .map(m => m[1].replace(/\bid="([^"]+)"/, (_, id) => `id="${src.toLowerCase()}.${id}"`).replace(/\bsource="[^"]*"/, `source="${src}"`))
  overlay(opt('--custom'), src, opt('--name'), amps.join(''))
  importXml(target, ` recipe="ai" source="${src}" name="${opt('--name')}" canon="${opt('--canon')}"`, `<file name="amps.xml" entries="${amps.length}"/>`)
  status(target, 'done', `${amps.length} entries applied`)
} else if (cmd === 'set-key') {
  const key = readFileSync(0, 'utf8').trim()
  const file = join(target, '.config', 'ai-keys.xml')
  mkdirSync(dirname(file), { recursive: true })
  const others = existsSync(file) ? [...readFileSync(file, 'utf8').matchAll(/<key provider="([^"]+)">[^<]*<\/key>/g)].filter(m => m[1] !== rest[0]).map(m => m[0]) : []
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300) // widen the read-modify-write window, as a slow Python start would
  writeFileSync(file, `<ca2:aikeys xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">${others.join('')}${key ? `<key provider="${rest[0]}">${key}</key>` : ''}</ca2:aikeys>\n`)
} else {
  process.stderr.write(`stub: unknown command ${cmd}\n`)
  process.exit(2)
}
