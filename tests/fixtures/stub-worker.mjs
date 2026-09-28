// Stand-in for `python -m importer …` in server tests and e2e (no Python in CI). Invoked as
// `node stub-worker.mjs -m importer <command> …`. It fakes each command's files just enough for the
// server's routes: status.xml, import.xml, a one-entry overlay, review.xml, ai-keys.xml.
// Markers in the uploaded bytes: "needs-ai" → no recipe matched; "crash" → exit 1 with a key on stderr.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const [, , , , cmd, target, ...rest] = process.argv
const opt = name => rest[rest.indexOf(name) + 1]
const now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
const status = (dir, state, msg = '') => writeFileSync(join(dir, 'status.xml'), `<status state="${state}" updated="${now}">${msg}</status>\n`)
const importXml = (dir, attrs = '', files = '') =>
  writeFileSync(join(dir, 'import.xml'), `<import file="stub.pdf" sha256="00" converter="stub" pages="1" score="1.00"${attrs}><files>${files}</files><report/></import>\n`)
const overlay = (custom, src) => {
  mkdirSync(join(custom, 'imported', src.toLowerCase()), { recursive: true })
  writeFileSync(join(custom, 'imported', src.toLowerCase(), 'amps.xml'),
    `<ca2:data xmlns:ca2="urn:chummer-anarchy2:data:1" kind="amps" version="1"><amp id="${src.toLowerCase()}.stub-amp" type="quality" source="${src}" page="1"><name>Stub Amp</name></amp></ca2:data>\n`)
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
    overlay(opt('--custom'), 'STUB')
    importXml(target, ' recipe="stub" source="STUB" name="Stub Book" publisher="Stub" canon="false" imported="2026-09-28T00:00:00+00:00"',
      '<file name="amps.xml" entries="1"/>')
    status(target, 'done')
  }
} else if (cmd === 'remove') {
  const src = readFileSync(join(target, 'import.xml'), 'utf8').match(/source="([^"]+)"/)?.[1]
  if (src) rmSync(join(opt('--custom'), 'imported', src.toLowerCase()), { recursive: true, force: true })
  if (rest.includes('--files')) rmSync(target, { recursive: true, force: true })
  else { importXml(target); status(target, 'removed') }
} else if (cmd === 'propose') {
  if (rest.includes('--dry-run')) console.log('<result parts="4" provider="anthropic" />')
  else {
    writeFileSync(join(target, 'review.xml'), `<review book="${basename(target)}" source="X" created="${now}" bookSha256="00" parts="1" done="1"><proposal id="amp.a" kind="amp" state="pending" page="1"><amp id="a"><name>A</name></amp></proposal></review>\n`)
    status(target, 'review', '1 proposals to review')
  }
} else if (cmd === 'apply-review') {
  overlay(opt('--custom'), opt('--source'))
  importXml(target, ` recipe="ai" source="${opt('--source')}"`, '<file name="amps.xml" entries="1"/>')
  status(target, 'done')
} else if (cmd === 'set-key') {
  const key = readFileSync(0, 'utf8').trim()
  const file = join(target, '.config', 'ai-keys.xml')
  mkdirSync(dirname(file), { recursive: true })
  const others = existsSync(file) ? [...readFileSync(file, 'utf8').matchAll(/<key provider="([^"]+)">[^<]*<\/key>/g)].filter(m => m[1] !== rest[0]).map(m => m[0]) : []
  writeFileSync(file, `<ca2:aikeys xmlns:ca2="urn:chummer-anarchy2:config:1" version="1">${others.join('')}${key ? `<key provider="${rest[0]}">${key}</key>` : ''}</ca2:aikeys>\n`)
} else {
  process.stderr.write(`stub: unknown command ${cmd}\n`)
  process.exit(2)
}
