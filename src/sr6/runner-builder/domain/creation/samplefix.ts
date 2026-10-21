// A book sample runner's printed lines as the owner's override file corrects them (the edits layer's <samplefix>,
// docs/sr6-data-format.md): a value the book misprints (the Face's earbuds at rating 4, CRB p. 85) is set right for the
// app's numbers while the runner file keeps the book's. Applied wherever a runner is read (the editor, Your runners, the
// export); Review notes each correction instead of the error.
import type { SampleCorrection, Sr6Character, Sr6Purchase } from '../../../formats/domain/character'
import type { Sr6Catalog } from '../../../formats/domain/types'
import { atLevel, familyOf, levelOf } from '../../../catalog/domain/levels'

/** The sample id a runner was loaded from (`CRB|crb.face` -> `crb.face`), or undefined. */
const sampleOf = (ch: Pick<Sr6Character, 'sampleKey'>) => ch.sampleKey?.split('|')[1]

/** The runner with its sample's corrections applied to its lines (a line still at the printed value), and the corrections
 *  made; the runner itself when there are none. Never changes the runner passed. */
export function withSampleFixes(
  c: Pick<Sr6Catalog, 'sampleFixes' | 'entries' | 'levels'>,
  ch: Sr6Character,
): { ch: Sr6Character; corrections: SampleCorrection[] } {
  const fix = c.sampleFixes?.get(sampleOf(ch) ?? '')
  if (!fix) return { ch, corrections: [] }
  const out = structuredClone(ch),
    corrections: SampleCorrection[] = []
  const lines = (xs: Sr6Purchase[], at = ''): { x: Sr6Purchase; path: string }[] =>
    xs.flatMap(x => [{ x, path: at || x.uid }, ...lines(x.accessories, at || x.uid)])
  for (const k of fix.corrects)
    for (const { x, path } of lines(out.build.purchases)) {
      // (a line holding a level of the family the fix names, levels.ts: its rating is that level, and a rating fix moves it)
      const fam = x.id && c.entries ? familyOf(c, x.kind, x.id) : undefined,
        level = fam && fam.family === k.item ? levelOf(c.entries[x.kind].get(x.id!)) : undefined
      const value = k.field === 'rating' && level !== undefined ? level : x[k.field]
      if ((x.id !== k.item && !(fam && fam.family === k.item)) || String(value ?? (k.field === 'qty' ? 1 : '')) !== k.from) continue
      if (k.field === 'grade') x.grade = k.to || undefined
      else if (k.field === 'rating' && level !== undefined) {
        const e = atLevel(c, x.kind, x.id, Number(k.to))
        if (!e) continue
        x.id = e.id
        x.name = e.name
      } else x[k.field] = Number(k.to)
      corrections.push({ path, item: k.item, field: k.field, from: k.from, to: k.to, source: fix.source, page: fix.page, ...(k.note ? { note: k.note } : {}) })
    }
  return corrections.length ? { ch: { ...out, corrections }, corrections } : { ch, corrections }
}
