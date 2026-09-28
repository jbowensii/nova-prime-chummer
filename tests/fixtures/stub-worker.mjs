// Stand-in for `python -m importer …` in server tests and e2e (books-python.test.ts runs the real one). Invoked as
// `node stub-worker.mjs -m importer <command> …`. It fakes each command's files just enough for the
// server's routes and the app: status.xml, import.xml, a one-entry overlay listed in
// custom/imported/index.xml and sources.xml, review.xml, ai-keys.xml, ai-providers.xml, and the edits layer
// (custom/edits/edits.xml, texts.xml, sources.xml; a <name></name> or a name starting REFUSE is refused like a real check).
// Markers in the uploaded bytes: "needs-ai" → no recipe matched; "crash" → exit 1 with a key on stderr; "slow" → the import takes 1.5 s.
// backup/restore write and read a fake zip ("PK\x03\x04\n", then JSON of the three folders' files); restore refuses
// anything else with exit 3 like the real check (importer/backup.py, run for real in backup-python.test.ts); datapack
// export/import likewise (importer/datapack.py, run for real in datapack-python.test.ts).
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const [, , , , cmd, target, ...rest] = process.argv
// STUB_LOG: one line per call, "<command> <book folder> <CA2_CUSTOM_DIR>" (tests of the job order)
if (process.env.STUB_LOG) appendFileSync(process.env.STUB_LOG, `${cmd} ${basename(target ?? '')} ${process.env.CA2_CUSTOM_DIR ?? ''}\n`)
const opt = name => rest.find(a => a.startsWith(`${name}=`))?.slice(name.length + 1) ?? rest[rest.indexOf(name) + 1]
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
  if (pdf.includes('slow')) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)
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
  else if (existsSync(join(target, 'review.xml')) && !rest.includes('--fresh')) status(target, 'review', 'Proposals from an earlier run are waiting for review; nothing was sent')
  else if (rest.includes('--core')) { // rows for a weapons table the recipe couldn't read
    writeFileSync(join(target, 'review.xml'), `<review book="${basename(target)}" source="CRB" core="true" provider="anthropic" created="${now}" bookSha256="00" parts="1" done="1">
  <proposal id="weapon.pea-shooter" kind="weapon" state="pending" page="142"><item id="pea-shooter" kind="weapon" dv="2" ranges="OK/OK/-/-" source="CRB" page="142"><name>Pea Shooter</name><text></text></item></proposal>
</review>\n`)
    status(target, 'review', '1 proposal to review')
  } else {
    writeFileSync(join(target, 'review.xml'), `<review book="${basename(target)}" source="X" provider="anthropic" created="${now}" bookSha256="00" parts="4" done="4">
  <proposal id="amp.a" kind="amp" state="pending" page="3"><amp id="a" type="quality" printedRating="0" source="X" page="3"><name>Lucky Charm</name><narrative></narrative></amp></proposal>
  <proposal id="gear.tin-spoon" kind="gear" state="pending" page="4"><item id="tin-spoon" kind="gear" source="X" page="4"><name>Tin Spoon</name><text></text></item><note>no price given</note></proposal>
</review>\n`)
    status(target, 'review', '2 proposals to review')
  }
} else if (cmd === 'apply-review' && rest.includes('--core')) {
  const review = readFileSync(join(target, 'review.xml'), 'utf8')
  const items = [...review.matchAll(/<proposal\b[^>]*state="(?:accepted|edited)"[^>]*>\s*(<item\b[\s\S]*?<\/item>)/g)].map(m => m[1])
  mkdirSync(join(opt('--custom'), 'imported', 'core'), { recursive: true })
  writeFileSync(join(opt('--custom'), 'imported', 'core', 'weapons.xml'), `<ca2:data ${NS} kind="weapons" version="1">${items.join('')}</ca2:data>\n`)
  writeFileSync(join(target, 'import.xml'), readFileSync(join(target, 'import.xml'), 'utf8').replace(/<row kind="core-unread" file="weapons.xml"[^>]*\/>/, ''))
  status(target, 'done', `${items.length} rows added to the core data`)
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
} else if (cmd === 'set-settings') { // the real checks are tested with Python (importer tests, books-python.test.ts)
  const body = readFileSync(0, 'utf8'), config = join(rest[0], '.config'), file = join(config, 'ai-providers.xml')
  if (!/<ca2:aiproviders\b/.test(body) || /<key\b/.test(body)) {
    process.stderr.write('provider settings only; keys go to /api/ai-keys\n')
    process.exit(3)
  }
  const urls = x => Object.fromEntries([...x.matchAll(/<provider id="(\w+)"([^>]*)\/>/g)].map(m => [m[1], m[2].match(/ baseUrl="([^"]*)"/)?.[1] ?? '']))
  const before = urls(existsSync(file) ? readFileSync(file, 'utf8') : ''), after = urls(body)
  const keys = join(config, 'ai-keys.xml'), held = existsSync(keys) ? readFileSync(keys, 'utf8') : ''
  const cleared = Object.keys(after).filter(p => (before[p] ?? '') !== after[p] && held.includes(`<key provider="${p}">`))
  if (cleared.length) writeFileSync(keys, held.replace(new RegExp(`<key provider="(?:${cleared.join('|')})">[^<]*</key>`, 'g'), ''))
  mkdirSync(config, { recursive: true })
  writeFileSync(file, body)
  console.log(`<result cleared="${cleared.join(' ')}" />`)
} else if (cmd === 'list-models') { // target is the provider; a saved key containing "bad" is refused, echoed unredacted
  const keys = join(opt('--library'), '.config', 'ai-keys.xml')
  const key = (existsSync(keys) ? readFileSync(keys, 'utf8') : '').match(new RegExp(`<key provider="${target}">([^<]*)</key>`))?.[1]
  const fail = why => { process.stderr.write(`${why}\n`); process.exit(3) }
  if (target === 'anythingllm') fail('this provider has no model list')
  if (!key) fail(`no API key is set for ${target}`)
  if (key.includes('bad')) fail(`stub.example answered HTTP 401: invalid key ${key}`)
  console.log({ anthropic: 'claude-sonnet-5\nclaude-opus-5\nclaude-haiku-4-5', openai: 'gpt-5\ngpt-5-mini', gemini: 'gemini-2.5-pro\ngemini-2.5-flash' }[target])
} else if (cmd === 'edit') { // target: set | remove | add-source; the real checks are importer/edits.py's (books-python.test.ts)
  const dir = join(opt('--custom'), 'edits'), [kind, id] = rest
  const tag = { amps: 'amp', items: 'item', rules: 'rule' }[kind]
  const read = (f, root) => existsSync(join(dir, f)) ? readFileSync(join(dir, f), 'utf8') : `<ca2:data ${NS} kind="${root}" version="1">\n</ca2:data>\n`
  const refuse = why => { process.stderr.write(`${why}\n`); process.exit(3) }
  mkdirSync(dir, { recursive: true })
  const drop = (xml, re) => xml.replace(re, '')
  const entryRe = new RegExp(`  <${tag} id="${id?.replace(/\./g, '\\.')}"[\\s\\S]*?</${tag}>\\n`)
  const textRe = new RegExp(`  <text of="${kind}" id="${id?.replace(/\./g, '\\.')}">[^<]*</text>\\n`)
  if (target === 'add-source') {
    const sources = read('sources.xml', 'sources')
    if (sources.includes(`id="${kind}"`) || ['TEST', 'TEST2', 'TESTC', 'CRB'].includes(kind)) refuse(`the source id ${kind} is already used; pick another`)
    writeFileSync(join(dir, 'sources.xml'), sources.replace('</ca2:data>', `  <source id="${kind}" publisher="" canon="false"><name>${opt('--name')}</name></source>\n</ca2:data>`))
    console.log('<result state="saved" />')
  } else if (target === 'set') {
    const body = readFileSync(0, 'utf8')
    const entry = body.match(new RegExp(`<${tag}\\b[\\s\\S]*?</${tag}>`))?.[0]
    const desc = body.match(/<description>([^<]*)<\/description>/)?.[1] ?? ''
    if (!entry || !entry.includes(`id="${id}"`)) refuse(`an edit of ${kind} needs one <${tag}> entry with id "${id}"`)
    if (/<name>\s*<\/name>/.test(entry)) refuse('no id or name')
    if (entry.includes('<name>REFUSE')) refuse('unknown effect ref "stub-refusal"')
    const edits = drop(read('edits.xml', 'edits'), entryRe), texts = drop(read('texts.xml', 'texts'), textRe)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 150) // widen the read-modify-write window
    writeFileSync(join(dir, 'edits.xml'), edits.replace('</ca2:data>', `  ${entry}\n</ca2:data>`))
    writeFileSync(join(dir, 'texts.xml'), desc.trim() ? texts.replace('</ca2:data>', `  <text of="${kind}" id="${id}">${desc}</text>\n</ca2:data>`) : texts)
    console.log('<result state="saved" />')
  } else if (target === 'remove') {
    const edits = read('edits.xml', 'edits'), texts = read('texts.xml', 'texts')
    writeFileSync(join(dir, 'edits.xml'), drop(edits, entryRe))
    writeFileSync(join(dir, 'texts.xml'), drop(texts, textRe))
    console.log(`<result removed="${entryRe.test(edits) || textRe.test(texts)}" />`)
  }
} else if (cmd === 'backup' || cmd === 'restore') {
  const args = [target, ...rest], flag = f => args[args.indexOf(f) + 1]
  const dirs = { characters: flag('--characters'), custom: flag('--custom'), library: flag('--library') }
  const KEYS = 'library/.config/ai-keys.xml', MAGIC = 'PK\x03\x04\n'
  const walk = (root, rel = '') => !existsSync(join(root, rel)) ? [] : readdirSync(join(root, rel), { withFileTypes: true }).flatMap(d =>
    d.isDirectory() ? (rel === '' && d.name === '.backups' ? [] : walk(root, `${rel}${d.name}/`)) : d.name.endsWith('.tmp') ? [] : [rel + d.name])
  const zip = (out, keys) => {
    const files = {}, folders = {}
    for (const [f, root] of Object.entries(dirs)) {
      const names = walk(root).filter(n => keys || `${f}/${n}` !== KEYS)
      for (const n of names) files[`${f}/${n}`] = readFileSync(join(root, n)).toString('base64')
      folders[f] = names.length
    }
    mkdirSync(dirname(out), { recursive: true })
    writeFileSync(out, MAGIC + JSON.stringify({ app: flag('--version') ?? 'unknown', created: new Date().toISOString(), keys, folders, files }))
  }
  const read = file => {
    try { return JSON.parse(readFileSync(file, 'utf8').slice(MAGIC.length)) } catch { /* below */ }
    process.stderr.write('this isn’t a readable zip file (stub)\n')
    process.exit(3)
  }
  if (cmd === 'backup') { // a partial temp next to the zip for 300 ms, like the real backup's mkstemp .tmp
    const tmp = join(dirname(flag('--out')), '.backup.stub.tmp')
    writeFileSync(tmp, 'partial')
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 300)
    zip(flag('--out'), args.includes('--keys'))
    rmSync(tmp)
  }
  else if (args.includes('--check')) {
    const z = read(flag('--check')), n = Object.values(z.folders).reduce((a, b) => a + b, 0)
    console.log(`<backup format="1" app="${z.app}" created="${z.created}" keys="${z.keys ? 'yes' : 'no'}" files="${n}" bytes="0">${
      Object.entries(z.folders).map(([f, c]) => `<folder name="${f}" files="${c}" bytes="0"/>`).join('')}</backup>`)
  } else {
    const z = read(flag('--apply'))
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400) // a window for the "nothing writes during a restore" tests
    zip(join(dirs.library, '.backups', `${new Date().toISOString().replace(/\D/g, '').slice(0, 14)}_000000Z.zip`), true)
    const keysFile = join(dirs.library, '.config', 'ai-keys.xml')
    const kept = !z.keys && existsSync(keysFile) ? readFileSync(keysFile) : null // a backup without keys keeps the server's
    for (const [f, root] of Object.entries(dirs)) {
      mkdirSync(root, { recursive: true })
      for (const n of readdirSync(root)) if (!(f === 'library' && n === '.backups')) rmSync(join(root, n), { recursive: true, force: true })
    }
    for (const [name, b64] of Object.entries(z.files)) {
      const [f, ...rel] = name.split('/'), path = join(dirs[f], ...rel)
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, Buffer.from(b64, 'base64'))
    }
    if (kept) { mkdirSync(dirname(keysFile), { recursive: true }); writeFileSync(keysFile, kept) }
    console.log('<result state="restored" safety="stub.zip" />')
  }
} else if (cmd === 'datapack') { // target: export | import; the stub's "zip" is JSON behind a zip header (the real one: datapack-python.test.ts)
  const MAGIC = 'PK\x03\x04\n', CORE = /^(ampeffects|amptypes|armor|attributes|levels|lifestyles|metatypes|packages|pricing|skills|vehicles|weapons)\.xml$/
  const core = join(opt('--custom'), 'imported', 'core')
  if (target === 'export') {
    const names = existsSync(core) ? readdirSync(core).filter(n => CORE.test(n)) : []
    if (!names.length) { process.stderr.write('there is no core data to put in a pack. Import the core rulebook first\n'); process.exit(3) }
    writeFileSync(opt('--out'), MAGIC + JSON.stringify({ app: opt('--version'), files: Object.fromEntries(names.map(n => [n, readFileSync(join(core, n), 'utf8')])) }))
  } else {
    let pack = null
    try { pack = JSON.parse(readFileSync(rest[0], 'utf8').slice(MAGIC.length)) } catch { /* below */ }
    if (!pack?.files) { process.stderr.write('this isn’t a readable zip file (stub)\n'); process.exit(3) }
    const bad = Object.keys(pack.files).find(n => !CORE.test(n))
    if (bad) { process.stderr.write(`the pack has a file a data pack can’t hold: ${bad} (only datapack.xml and the core files in core/)\n`); process.exit(3) }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 400) // a window for the "nothing else runs meanwhile" tests
    mkdirSync(core, { recursive: true })
    for (const [n, text] of Object.entries(pack.files)) writeFileSync(join(core, n), text)
    console.log(`<result state="imported" files="${Object.keys(pack.files).sort().join(' ')}" />`)
  }
} else {
  process.stderr.write(`stub: unknown command ${cmd}\n`)
  process.exit(2)
}
