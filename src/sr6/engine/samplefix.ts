// A book sample runner's printed lines as the owner's override file corrects them (the edits layer's <samplefix>,
// docs/sr6-data-format.md): a value the book misprints (the Face's earbuds at rating 4, CRB p. 85) is set right for the
// app's numbers while the runner file keeps the book's. Applied wherever a runner is read (the editor, Your runners, the
// export); Review notes each correction instead of the error.
import type { Sr6Character, Sr6Purchase } from '../model/character'
import type { Sr6Catalog } from '../model/types'

/** One correction applied: the runner's line, what the book prints and what it reads as, the fix's page and note. */
export interface SampleCorrection { path: string; item: string; field: string; from: string; to: string; source: string; page: number; note?: string }

/** The sample id a runner was loaded from (`CRB|crb.face` -> `crb.face`), or undefined. */
const sampleOf = (ch: Pick<Sr6Character, 'sampleKey'>) => ch.sampleKey?.split('|')[1]

/** The runner with its sample's corrections applied to its lines (a line still at the printed value), and the corrections
 *  made; the runner itself when there are none. Never changes the runner passed. */
export function withSampleFixes(c: Pick<Sr6Catalog, 'sampleFixes'>, ch: Sr6Character): { ch: Sr6Character; corrections: SampleCorrection[] } {
  const fix = c.sampleFixes?.get(sampleOf(ch) ?? '')
  if (!fix) return { ch, corrections: [] }
  const out = structuredClone(ch), corrections: SampleCorrection[] = []
  const lines = (xs: Sr6Purchase[], at = ''): { x: Sr6Purchase; path: string }[] =>
    xs.flatMap(x => [{ x, path: at || x.uid }, ...lines(x.accessories, at || x.uid)])
  for (const k of fix.corrects) for (const { x, path } of lines(out.build.purchases)) {
    if (x.id !== k.item || String(x[k.field] ?? (k.field === 'qty' ? 1 : '')) !== k.from) continue
    if (k.field === 'grade') x.grade = k.to || undefined; else x[k.field] = Number(k.to)
    corrections.push({ path, item: k.item, field: k.field, from: k.from, to: k.to, source: fix.source, page: fix.page, ...(k.note ? { note: k.note } : {}) })
  }
  return corrections.length ? { ch: { ...out, corrections }, corrections } : { ch, corrections }
}
