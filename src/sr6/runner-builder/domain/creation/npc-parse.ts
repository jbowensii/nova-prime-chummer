// NPC stat-block text parsing: bracket-aware splitting of a line into things and reading a thing's printed stats.
import { formula } from '../../../catalog/domain/values'
import { GRADE, type Sr6NpcThing } from './npc-types'

/** `s` split at its commas outside any bracket; trimmed, empties dropped. */
export function top(s: string): string[] {
  const out = ['']
  let depth = 0
  for (const ch of s) {
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    if (ch === ',' && !depth) out.push('')
    else out[out.length - 1] += ch
  }
  return out.map(x => x.trim()).filter(Boolean)
}
/** five attack rating bands: `10/8/6/—/—`, `(F x 2) +4/—/—/—/—`, `8/2*` (a footnote mark), `6(8)` (with a focus) */
const BAND = String.raw`(?:\d+(?:\(\d+\))?\*?|[—–-])`
const AR_SRC = String.raw`(?:\(F\s*[x×*]\s*\d+\)\s*(?:[+-]\s*\d+)?|${BAND})(?:\s*\/\s*${BAND}){4}`
const AR_RUN = new RegExp(AR_SRC, 'g'),
  HAS_AR = new RegExp(AR_SRC)
const CLOSES: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
/** The top-level bracket groups of `s` as [opening index, closing index]: a closer closes the nearest opener of its own
 *  kind (an opener left open inside it closes with it: `[(DV 8S + Fatigue I, …]`); a stray closer counts for nothing. */
export function groups(s: string): [number, number][] {
  const out: [number, number][] = [],
    stack: { ch: string; at: number }[] = []
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if ('([{'.includes(ch)) stack.push({ ch, at: i })
    else if (CLOSES[ch]) {
      const k = stack.map(x => x.ch).lastIndexOf(CLOSES[ch])
      if (k < 0) continue
      if (k === 0) out.push([stack[0].at, i])
      stack.length = k
    }
  }
  return out
}
/** A weapons or attacks line split into its things: after each top-level `[…]` (`Bite [DV 2P, 8/—/—/—/—] Claws […]`)
 *  or `(…)` holding attack ratings (`Beretta (2P, SA, 9/8/6/—/—) Shotgun (…)`), after each run of attack ratings printed
 *  without one (`Bite 2P, 6/—/—/—/— Claw 1P, 4/—/—/—/—`), else at semicolons and at commas (but `Bite: DV 4P, Attack
 *  Rating 9` stays one). What follows a `**` or ` // ` (book text the reader ran on with) is left out. */
export function splitThings(text: string): string[] {
  const s = text.split(/\*\*|\s\/\/\s/)[0]
  const out: string[] = []
  const loose = (t: string) => {
    let at = 0
    for (const m of t.matchAll(AR_RUN)) {
      out.push(t.slice(at, m.index + m[0].length))
      at = m.index + m[0].length
    }
    for (const chunk of t.slice(at).split(';')) out.push(...(/:\s*(?:DV\s*)?\d|^\S.*?\s\d+\s*[PS]\b/i.test(chunk) ? [chunk] : top(chunk)))
  }
  let at = 0
  for (const [open, close] of groups(s)) {
    if (s[open] !== '[' && !(s[open] === '(' && HAS_AR.test(s.slice(open, close)))) continue
    // the group's thing is named by what follows the last comma or attack-rating run before it
    const head = s.slice(at, open)
    const cut = Math.max(head.lastIndexOf(','), head.lastIndexOf(';'), ...[...head.matchAll(AR_RUN)].map(m => m.index + m[0].length - 1))
    if (cut >= 0) loose(head.slice(0, cut + 1))
    out.push(s.slice(at + cut + 1, close + 1))
    at = close + 1
  }
  loose(s.slice(at))
  return out.map(x => x.replace(/^[\s,;]+|[\s,;]+$/g, '')).filter(x => x && x.length <= 200)
}

/** A printed number, or a formula of the NPC's Force at its rating (`(Force/2) + 2`, `(F x 2) +4`); null when it can't
 *  be read. */
function valueAt(s: string, rating: number | undefined): number | null {
  let t = s
    .replace(/\bForce\b/gi, 'F')
    .replace(/\*/g, '')
    .trim()
  if (/^\d+$/.test(t)) return Number(t)
  // a closing bracket the book left over: `(F x 2) – 8)`
  while ((t.match(/\)/g) ?? []).length > (t.match(/\(/g) ?? []).length) t = t.replace(/\)\s*$/, '').trim()
  if (rating == null || !/\bF\b/.test(t)) return null
  const f = formula(t, rating, 'F')
  return f.ok && f.dice == null ? f.n : null
}
/** A thing's name and its stat pieces: those of the bracket it ends with (`[…]`; gear's `Armor jacket (+4)`), or what
 *  follows its name when it has none (`Bite: DV 19P, 38/—/—/—/—`, `Claws 2P, 11/—/—/—/—`). */
export function pieces(printed: string): { name: string; stats: string[] } {
  const last = groups(printed).at(-1)
  if (last && last[0] > 0 && last[1] === printed.length - 1)
    return { name: printed.slice(0, last[0]).trim(), stats: top(printed.slice(last[0] + 1, -1).replace(/^\(\s*(?=DV)/i, '')) }
  const bare = printed.length <= 200 ? printed.match(/^(.+?)(?::\s*|\s+(?=(?:DV\s*)?\d+\s*\(?[PS]\b))(.*\d.*)$/i) : null
  return bare ? { name: bare[1].trim(), stats: top(bare[2]) } : { name: printed, stats: [] }
}
/** A thing's printed stats: its category, DV, attack ratings, firing modes, ammo, rating, Defense and `w/` accessories. */
export function readStats(stats: string[], rating: number | undefined) {
  const v: Sr6NpcThing['values'] = {},
    accessories: string[] = []
  let category: string | undefined,
    dvText: string | undefined,
    grade: string | undefined,
    count: number | undefined,
    fitted = false
  // a category and DV printed without a comma (`Light Pistol DV 2S(e)`), accessories after a run without one (`8/8/6/—/— w/ …`)
  const all = stats.flatMap(p => p.split(/\s+(?=DV\b)|\s+(?=w\/)|\s*;\s*/i))
  let licences = false
  all.forEach((raw, i) => {
    const t = raw.replace(/^\(+(?=DV)/i, '').trim()
    let m: RegExpMatchArray | null
    // (`licenses: augmentations, RCC`: each word after the colon a licence, until something else)
    if ((m = t.match(/^licen[sc]es?\s*:\s*(.+)$/i)) || (licences && /^[a-z][\w -]*$/i.test(t) && !/^(?:rating|dr|w)\b/i.test(t) && (m = [t, t]))) {
      licences = true
      accessories.push(...m[1].split(/\s+(?:and|&)\s+/i).map(x => `${x.trim()} license`))
      return
    }
    licences = false
    if ((m = t.match(/^(?:w\/|with\s)\s*(.+)$/i))) {
      fitted = true
      accessories.push(...m[1].split(/\s+(?:and|&)\s+|\s+\+\s+/i))
    } else if (v.dv == null && !dvText && (m = t.match(/^(?:DV\s*)?(\[[^\]]*\]|\([^)]*\)|F(?:\s*[x×*/+\-–]\s*\d+)*|\d+)\s*\(?([PS])\)?(?![a-z])/i))) {
      // a number, a bracketed formula, or a bare one of the Force (`F/2P`, `F + 2 S`, `F x2P`): dv only when it reads
      dvText = t.replace(/^DV\s*/i, '')
      const n = valueAt(m[1].replace(/^[[(]|[\])]$/g, ''), rating)
      if (n != null) Object.assign(v, { dv: n, stun: m[2].toUpperCase() === 'S' })
    } else if (!v.ar && (m = t.match(/^(?:AR|Attack Ratings?)\s*:?\s*(\d+)$/i))) v.ar = [Number(m[1]), null, null, null, null]
    else if (!v.ar && (m = t.match(/^(?:AR|Attack Ratings?)?\s*([^/]*(?:\/[^/]*){4})$/i))) {
      // a band's footnote mark, focus bonus (`6(8)`) or note (`— (Venom)`) aside
      // a band's footnote mark, focus bonus (`6(8)`) or note (`— (Venom)`) aside; a band at 0 or less is none
      const bands = m[1].split('/').map(b => {
        const n = /\d|\bF\b/.test(b) ? valueAt(b.replace(/\(\d+\)|\s\((?!F\b).*$/g, ''), rating) : null
        return n != null && n > 0 ? n : null
      })
      if (bands.some(b => b != null)) v.ar = bands
    } else if (/^(SS|SA|BF|FA)(\s*\/\s*(SS|SA|BF|FA))*$/i.test(t)) v.modes = t.toUpperCase().split(/\s*\/\s*/)
    else if ((m = t.match(/^(\d+)\s*\(?[a-z]{1,2}\)?$/i))) v.ammo = Number(m[1])
    else if ((m = t.match(/^(?:R|(?:Device\s+)?Rating)\s*:?\s*(\d+)$/i))) v.rating = Number(m[1])
    else if ((m = t.match(/^(?:(?:DR|Defense(?:\s+Rating)?)\s*\+?\s*(\d+)|\+\s*(\d+)\s*(?:DR|Defense(?:\s+Rating)?)?)$/i))) v.defense = Number(m[1] ?? m[2])
    else if ((m = t.match(GRADE))) grade = m[1].toLowerCase()
    else if ((m = t.match(/^x\s*(\d+)$/i))) count = Number(m[1])
    else if (i === 0 && /^[a-z][a-z -]{1,30}$/i.test(t)) category = t
    else if (fitted && (!/\d/.test(t) || /^[a-z-]+(?:\s[a-z-]+){0,2}\s\d{1,2}$/i.test(t))) accessories.push(t)
  })
  return { values: v, category, dvText, grade, count, accessories: accessories.map(a => a.trim()).filter(Boolean) }
}
