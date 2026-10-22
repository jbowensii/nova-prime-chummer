// Every book sample runner of an import (custom/sr6/imported/samples.xml), read as Load example characters copies it and
// reviewed as Your runners does (withSampleFixes, validateSr6, the shipped creation-defaults.xml): no review error but one an
// owner-ruled annotation covers. No book data in the repo: SR6_CATALOG=<a data folder holding custom/sr6, e.g. an import
// run's folder> npx vitest run tests/sr6/sample-review-live.test.ts; SR6_SAMPLES_OUT=<file> writes
// [{name, source, errors, annotated, messages}] as JSON. Skipped without SR6_CATALOG.
// Covered, strictly and per instance: a `[review: <code> | <text>]` tag in a sample.corrected warning (the override file's
// <samplefix>) or in the note of a book-error row of importer/sr6/overrides/samples/<book>.json for that sample which the
// import put in the runner's notes (a row of kind "assumption" covers nothing), whose code is the error's and whose text
// is in the error's message (`8 karma left`: the measured number too); each tag covers one error.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { sr6Data } from '../../src/sr6/catalog/domain/data'
import { buildSr6Catalog, collectSr6Files } from '../../src/sr6/catalog/domain/load'
import { xmlToSr6 } from '../../src/sr6/formats/domain/charxml'
import { withSampleFixes } from '../../src/sr6/runner-builder/domain/creation/samplefix'
import { validateSr6 } from '../../src/sr6/runner-builder/domain/review/rules'
import { parseCreation, runnerRules } from '../../src/sr6/table-setup/domain/creation'

const DIR = process.env.SR6_CATALOG

test.skipIf(!DIR)(
  'sample-review: every book sample runner reviews clean but for owner-ruled annotations',
  async () => {
    const get = async (path: string) => {
      const file = path.startsWith('data/') ? join('public', path) : path.startsWith('custom/sr6/') ? join(DIR!, path) : null
      try {
        return file ? readFileSync(file, 'utf8') : null
      } catch {
        return null
      }
    }
    const c = buildSr6Catalog((await collectSr6Files(get)).files),
      data = sr6Data(c),
      shipped = parseCreation(readFileSync('public/data/sr6/creation-defaults.xml', 'utf8')).rules
    const list = readFileSync(join(DIR!, 'custom/sr6/imported/samples.xml'), 'utf8')
    const rows = [...list.matchAll(/<sample\b([^>]*)\/>/g)].map(m => Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(a => [a[1], a[2]])))
    const out = rows.map(s => {
      const r = xmlToSr6(readFileSync(join(DIR!, 'custom/sr6/imported', s.href), 'utf8'))
      if (!r.ok) return { name: s.name, source: s.source, errors: [`unreadable: ${r.reason}`], annotated: [], messages: [] }
      const key = `${s.source}|${s.href
        .split('/')
        .pop()!
        .replace(/\.xml$/, '')}`
      const ch = withSampleFixes(c, { ...r.character, sampleKey: key }).ch
      const v = validateSr6(data, runnerRules(shipped, ch.rules), ch)
      const ownFile = join('importer/sr6/overrides/samples', `${s.source.toLowerCase()}.json`)
      const notes = (existsSync(ownFile) ? (JSON.parse(readFileSync(ownFile, 'utf8')) as { sample: string; kind?: string; note: string }[]) : [])
        .filter(o => o.sample === s.name && o.kind !== 'assumption' && ch.identity.notes.includes(o.note))
        .map(o => o.note)
      const said = [...notes, ...v.filter(x => x.code === 'sample.corrected').map(x => x.message)]
      const tags = said.flatMap(t => [...t.matchAll(/\[review: ([\w.]+) \| ([^\]]+)\]/g)].map(m => ({ code: m[1], text: m[2], used: false })))
      const errs = v.filter(x => x.severity === 'error' && !x.approved)
      const covered = errs.map(x => {
        const t = tags.find(t => !t.used && t.code === x.code && x.message.includes(t.text))
        if (t) t.used = true
        return !!t
      })
      return {
        name: s.name,
        source: s.source,
        errors: errs.filter((_, i) => !covered[i]).map(x => x.code),
        annotated: errs.filter((_, i) => covered[i]).map(x => x.code),
        messages: errs.map(x => `${x.code}: ${x.message}`),
      }
    })
    if (process.env.SR6_SAMPLES_OUT) writeFileSync(process.env.SR6_SAMPLES_OUT, JSON.stringify(out, null, 1))
    expect(out.length).toBeGreaterThan(0)
    expect(out.flatMap(r => r.errors.map(e => `${r.name}: ${e}`))).toEqual([])
  },
  900_000,
)
