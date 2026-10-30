// SR6 admin "move to trash" (GET|POST /api/sr6/books/clear/:kind, server/books.mjs): the loaded book copies the app shows,
// i.e. runner files whose root element carries sampleKey="…" (src/sr6/npcs/domain/bookNpcs.ts, Runners.tsx loadExamples).
// kind "npcs": <sr6>/npcs/<user>/*.xml; kind "samples": <sr6>/characters/<user>/*.xml. Files without a sampleKey (real PCs,
// hand-made NPCs) stay, as do .trash/ and .compendiums/. imported/ is never touched. GET: the plan; POST: copies each file
// to <backups>/sr6-pre-clear-<stamp>/, then MOVES it to <trash>/cleared-samples-<stamp>/ (paths relative to `base` kept)
// and writes moves.csv (from,to) there to reverse it. Nothing is deleted. Mirrors the tower04 clear-chummer-samples script.
import { appendFile, copyFile, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join, relative } from 'node:path'

/** true when the file's root element has a sampleKey attribute (the first tag that isn't <?…?> or <!…>). */
const isCopy = text => /\bsampleKey="/.test(text.match(/<[^?!][^>]*>/)?.[0] ?? '')

/** { files: [path], users: [{ user, count }], kept } for the store `dir` (one folder per user). */
export async function clearPlan(dir) {
  const files = [],
    users = []
  let kept = 0
  for (const u of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (!u.isDirectory() || u.name.startsWith('.')) continue
    let count = 0
    for (const f of await readdir(join(dir, u.name), { withFileTypes: true })) {
      if (!f.isFile() || !f.name.endsWith('.xml')) continue
      const p = join(dir, u.name, f.name)
      if (!isCopy(await readFile(p, 'utf8'))) kept++
      else {
        files.push(p)
        count++
      }
    }
    if (count) users.push({ user: u.name, count })
  }
  return { files, users, kept }
}

/** one RFC 4180 field: quoted (inner quotes doubled) when it holds a comma, quote or line break. */
export const csvField = s => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)

const stampNow = (d = new Date()) => d.toISOString().slice(0, 19).replace(/-|:/g, '').replace('T', '-')

/** Backs up then moves the plan's files; returns { moved, kept, users, trash }. */
export async function clearApply(dir, { base, backups, trash, stamp = stampNow() }) {
  const plan = await clearPlan(dir)
  const backup = join(backups, `sr6-pre-clear-${stamp}`),
    gone = join(trash, `cleared-samples-${stamp}`)
  for (const f of plan.files) {
    const b = join(backup, relative(base, f))
    await mkdir(dirname(b), { recursive: true })
    await copyFile(f, b) // all backed up before anything moves
  }
  if (plan.files.length) {
    await mkdir(gone, { recursive: true })
    await writeFile(join(gone, 'moves.csv'), 'from,to\n')
  }
  for (const f of plan.files) {
    const to = join(gone, relative(base, f))
    await mkdir(dirname(to), { recursive: true })
    await rename(f, to)
    await appendFile(join(gone, 'moves.csv'), `${csvField(f)},${csvField(to)}\n`)
  }
  return { moved: plan.files.length, kept: plan.kept, users: plan.users, trash: gone }
}
