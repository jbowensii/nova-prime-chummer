// NPC gear and augmentation lines: splitting, forms, abbreviations, licences and expansion to catalog entries.
import type { Sr6Catalog, Sr6Entry, Sr6Kind } from '../../../formats/domain/types'
import { matchKey, nameRatio, normName } from '../../../catalog/domain/names'
import { groups, top } from './npc-parse'
import { GRADE, type Index, type Sr6NpcMatch, type Sr6NpcThing } from './npc-types'
import { indexOf } from './npc-index'
import { findEntry, prefer, round, standardOf } from './npc-match'

/** A gear or augmentation line's helpers (owner 2026-10-21, "NPC unlinked gear"). */
/** A GM's instruction where a line would print gear (`As needed`, `As selected by the gamemaster`, `Other gear as needed`,
 *  `Whatever she needs`, `Fit to situation`, `6 Copies`, `See text`): a note, never an item. */
export const GM_NOTE =
  /^\W*(?:as\s+(?:needed|applicable|selected|noted|appropriate|required)\b|(?:any\s+)?other\s+(?:appropriate\s+)?(?:gear|equipment)\b|whatever\b|fit\s+to\b|\d+\s+copies\b|[^,]*\bneeded\s+for\b|(?:see\s+)?text\W*$)/i
/** A GM's instruction where a spells line would print a spell (`Gamemaster discretion`, `Any desired`, `others at
 *  gamemaster discretion`, `if needed (up to 10)`): a note, as GM_NOTE's are */
const SPELL_GM = /\bgamemaster|^\W*(?:any|others)\b|\bif\s+needed\b/i
/** a book reference printed after a spell (`Rot, p. 32, Street Wyrd (Range: T, …)`): its page */
const PAGE_REF = /^p(?:age|g)?\.?\s*\d+$/i
/** A spells line as the spells it prints, each with its name (its printed parameters, `Powerbolt [direct combat, …]`, left
 *  off): split after each `[…]` (a run-together `Powerbolt […] Fireball […]`), at commas, semicolons and a spaced slash
 *  (`Silence / Ward`); a `Rituals:` label dropped; GM instructions and prose left out (they stay in the line's text, the notes); a page
 *  or a book's name after a spell (`Rot, p. 32, Street Wyrd (…)`) kept in that spell's printed text. */
export function spellLines(c: Sr6Catalog, text: string): { printed: string; name: string }[] {
  // (a book by its name, `Shadowrun: Street Wyrd`, or without the game's: `Street Wyrd`)
  const books = new Set([...c.sources.values()].flatMap(s => [normName(s.name), normName(s.name.replace(/^shadowrun\b[^:]*:\s*/i, ''))]))
  const nameOf = (p: string) => {
    const g = groups(p).at(-1)
    return g && g[0] > 0 && g[1] === p.length - 1 ? p.slice(0, g[0]).trim() : p
  }
  const chunks: string[] = []
  let at = 0
  for (const [open, close] of groups(text))
    if (text[open] === '[') {
      chunks.push(text.slice(at, close + 1))
      at = close + 1
    }
  chunks.push(text.slice(at))
  const out: { printed: string; name: string }[] = []
  // (a semicolon or spaced slash outside brackets parts spells as a comma does; inside, it is the spell's own text)
  const commas = (s: string) => {
    let depth = 0,
      o = ''
    for (let i = 0; i < s.length; i++) {
      const ch = s[i]
      if ('([{'.includes(ch)) depth++
      else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
      o += !depth && (ch === ';' || (ch === '/' && s[i - 1] === ' ' && s[i + 1] === ' ')) ? ',' : ch
    }
    return o
  }
  for (const piece of chunks.flatMap(ch => top(commas(ch)))) {
    const p = piece.replace(/^(?:spells?|rituals?)\s*:\s*/i, '').replace(/[\s.]+$/, ''),
      name = nameOf(p)
    // (prose is read on the name, its bracket aside: `Increase Reflexes [Physical, Touch, …]` is a spell)
    if (!p || GM_NOTE.test(p) || SPELL_GM.test(p) || (PROSE.test(name) && name.split(/\s+/).length >= 6)) continue
    if (out.length && (PAGE_REF.test(p) || books.has(normName(nameOf(p))))) out[out.length - 1].printed += `, ${p}`
    else out.push({ printed: p, name })
  }
  return out
}
/** prose where a line prints items: a sentence that says what the NPC has or gains */
const PROSE = /\b(?:has|have|gains?|increases?|bonus|noted)\b/i
/** the head of an introduction to a list (`he has the following deltaware items`, `Augmentations (all gammaware)`) */
const INTRO = /\bfollowing\b|\ball\s+\w+ware\b|^augmentations\b|^\W*\w+ware\W*$/i
const BOOK_WORDING = new Map([['longcoat', 'Lined coat']]) // ponytail: the one ruled wording (importer/sr6/archetypes.py); add a pair when the owner rules another
/** an attribute and its augmented value (`Agility 9`): a value in the stat block, not a thing */
export const ATTRIBUTE_VALUE = /^(?:body|agility|reaction|strength|willpower|logic|intuition|charisma|edge|magic|resonance|essence|armor)\s+\d+(?:\.\d+)?$/i
export const NUMBER_WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
export const PACKS = String.raw`(?:packs?|packets?|boxes|bottles?|vials?|doses?)\s+of\s`
const GEAR_KINDS: Sr6Kind[] = ['gear', 'electronics', 'armor', 'programs', 'vehicles', 'weapons', 'augmentations', 'lifestyles', 'datastructures']

/** `s` with its brackets paired: a closer of the wrong kind closes the opener (`[+1) w/ …` is `[+1]`), a stray closer and
 *  the opener left open at the end are fixed (the reader ran lines on and cut them). */
function paired(s: string): string {
  const open: string[] = []
  let out = ''
  for (const ch of s) {
    if ('([{'.includes(ch)) {
      open.push(ch)
      out += ch
    } else if (')]}'.includes(ch)) {
      const o = open.pop()
      if (o) out += ')]}'['([{'.indexOf(o)]
    } else out += ch
  }
  return (
    out +
    open
      .reverse()
      .map(o => ')]}'['([{'.indexOf(o)])
      .join('')
  )
}
/** `s` split at its first top-level `w/` or `with`: the thing, then its add-ons (`Auber bodyguard suit (+3) with electric
 *  insulation 1`) as separate accessories; the thing alone when it has none. */
export function splitWith(s: string): string[] {
  let depth = 0
  for (let i = 0; i < s.length; i++) {
    if ('([{'.includes(s[i])) depth++
    else if (')]}'.includes(s[i])) depth = Math.max(0, depth - 1)
    else if (!depth && i > 0 && /\s/.test(s[i - 1]) && /^(?:w\/|with\s)/i.test(s.slice(i))) {
      let head = s.slice(0, i).trim(),
        tail = s.slice(i).replace(/^(?:w\/|with)\s*/i, '')
      // (a bracket of numbers that ends the whole line is the thing's: `Armored kimono with ballistic hood (DR +5)`, not a list: `w/ licenses (a, b)`)
      const end = groups(tail).at(-1)
      if (
        end &&
        end[0] > 0 &&
        end[1] === tail.length - 1 &&
        /^[([]\s*(?:\+|DR\b|Defense|device|rating|R\s*\d|\d)/i.test(tail.slice(end[0])) &&
        !groups(head).some(g => g[1] === head.length - 1)
      ) {
        head += ` ${tail.slice(end[0])}`
        tail = tail.slice(0, end[0])
      }
      return [head, ...tail.split(/\s+(?:and|&)\s+|\s+\+\s+/i)]
    }
  }
  return [s]
}
/** `a + b (DR+5)` as `a (DR+5)`, `b`: things joined by a spaced plus at no depth are a list; the bracket that ends it is the
 *  first one's (the printed Defense of the set read as the first thing's). */
function plusList(el: string): string[] {
  const parts: string[] = ['']
  let depth = 0
  for (let i = 0; i < el.length; i++) {
    const ch = el[i]
    if ('([{'.includes(ch)) depth++
    else if (')]}'.includes(ch)) depth = Math.max(0, depth - 1)
    if (!depth && ch === '+' && /\s/.test(el[i - 1] ?? '') && /\s/.test(el[i + 1] ?? '')) parts.push('')
    else parts[parts.length - 1] += ch
  }
  const things = parts.map(x => x.trim()).filter(Boolean)
  if (things.length < 2) return [el]
  const end = groups(things.at(-1)!).at(-1)
  if (end && end[0] > 0 && end[1] === things.at(-1)!.length - 1 && !groups(things[0]).some(g => g[1] === things[0].length - 1)) {
    things[0] += ` ${things.at(-1)!.slice(end[0])}`
    things[things.length - 1] = things.at(-1)!.slice(0, end[0]).trim()
  }
  return things
}
/** A gear or augmentations line as the things it prints, each with the grade it sets: GM instructions and prose left out
 *  (they stay in the line's text, the notes), `(all deltaware):` or `the following deltaware items:` the grade of what
 *  follows, a lone `(delta)` the grade of the item before it, a lone `bioware` nothing. */
export function stuffLines(text: string): { printed: string; grade?: string }[] {
  const out: { printed: string; grade?: string }[] = []
  let line: string | undefined
  for (const sentence of paired(text).split(/(?<=[\w)\]])\.\s+(?=[A-Z(])/)) {
    let s = sentence.trim()
    const intro = s.match(/^([^:]*?(?:\([^)]*\))?[^:]*):\s*(.+)$/s)
    if (intro && INTRO.test(intro[1])) {
      line = intro[1].match(/\b(alpha|beta|gamma|delta)ware\b/i)?.[1].toLowerCase()
      s = intro[2]
    } else if (intro && /^[\w\s]{1,30}$/.test(intro[1])) {
      // (a new label ends the grade of the one before: `Gear: …`)
      line = undefined
    } else if (PROSE.test(s.replace(/\([^)]*\)|\[[^\]]*\]/g, '')) && s.split(/\s+/).length >= 6) continue
    const lead = s.match(/^\(\s*(?:all\s+)?(alpha|beta|gamma|delta)ware\s*\)\s*(.*)$/i)
    if (lead) [line, s] = [lead[1].toLowerCase(), lead[2]]
    for (const el of top(s)
      .flatMap(e => (/^\[[^\]]*\]$/.test(e) ? top(e.slice(1, -1)) : [e]))
      .flatMap(plusList)) {
      const printed = el.replace(/[\s.]+$/, '')
      const g = printed.match(GRADE)
      if (!printed || GM_NOTE.test(printed) || ATTRIBUTE_VALUE.test(printed) || /^(?:cyber|bio|gene|nano)ware$/i.test(printed)) continue
      if (!g) out.push({ printed, ...(line ? { grade: line } : {}) })
      else if (out.length) out[out.length - 1].grade = g[1].toLowerCase()
      else line = g[1].toLowerCase()
    }
  }
  return out
}

/** What a glued name can be split by, per catalog and kinds: `ends`, the word keys it can end in (`goggles` in
 *  `smartgoggles`, `van` in `stepvan`: one-word entry names and the last words of categories) and `known`, every word the
 *  kinds' names and categories use (`crossbow` is one: not split). */
const wordSets = new WeakMap<Index, Map<string, { ends: Set<string>; known: Set<string> }>>()
function wordsOf(c: Sr6Catalog, kinds: Sr6Kind[]) {
  const x = indexOf(c),
    per = wordSets.get(x) ?? wordSets.set(x, new Map()).get(x)!,
    id = kinds.join()
  let sets = per.get(id)
  if (!sets) {
    sets = { ends: new Set<string>(), known: new Set<string>() }
    for (const k of kinds) {
      for (const l of x.loose.get(k) ?? []) {
        if (!l.key.includes(' ') && l.key.length >= 3) sets.ends.add(l.key)
        l.key.split(' ').forEach(w => sets!.known.add(w))
      }
      for (const ck of x.categories.get(k)?.keys() ?? []) {
        const words = ck.split(' ')
        if (words.at(-1)!.length >= 3) sets.ends.add(words.at(-1)!)
        words.forEach(w => sets!.known.add(w))
      }
    }
    per.set(id, sets)
  }
  return sets
}
/** The other forms a gear or augmentation name is printed in, from what is likely: either side of a colon
 *  (`cyberdeck: Fairlight Excalibur`), without its delivery or container (`jazz inhaler`, `dose of jazz`), an initialism's
 *  entry (`BDUs`), without trailing header capitals (`MCT 360 cyberdeck MATRIX STATS`), a glued word split
 *  (`smartgoggles`, `stepvan`, `cyberhand` with `obvious`: `hand (obvious)`); inner: a bracket's own name
 *  (`Adjudant Humà (Nissan Samurai)`). */
function formsOf(c: Sr6Catalog, name: string, printed: string, kinds: Sr6Kind[]): { forms: string[]; inner: string[] } {
  const forms: string[] = [],
    inner: string[] = []
  const add = (to: string[], s?: string) => {
    const t = s?.trim()
    if (t && t !== name && !to.includes(t)) to.push(t)
  }
  const colon = name.split(/:\s*/)
  // (`cyberdeck: Fairlight Excalibur` is the model; `jammer: directional 6`, either)
  if (colon.length === 2) (colon[1].trim().split(/\s+/).length >= 2 && !/\d/.test(colon[1]) ? [colon[1]] : colon.reverse()).forEach(t => add(forms, t))
  add(forms, name.replace(/\s+(?:inhalers?|syringes?|injectors?|pills?|tablets?|capsules?)$/i, ''))
  add(forms, name.replace(new RegExp(`^(?:\\d+\\s+)?${PACKS}`, 'i'), ''))
  add(forms, name.replace(/(?:\s+[A-Z]{3,})+$/, ''))
  add(forms, name.replace(/^(?:standard|regular|normal)\s+/i, ''))
  add(forms, name.replace(/\s+lifestyle$/i, ''))
  add(forms, name.replace(/\s+lenses$/i, ''))
  // (the owner's rulings on book wording, 2026-10-19: `long coat` is the Lined coat; joined or split)
  const joined = name.toLowerCase().replace(/\s+/g, '')
  add(forms, BOOK_WORDING.get(joined))
  const initials = name.match(/^([A-Z]{3,6})s?$/)?.[1].toLowerCase()
  // (an initialism two names share is none: `AAS`)
  const named = (initials ? (indexOf(c).initials.get(initials) ?? []) : []).filter(e => kinds.includes(e.kind))
  if (new Set(named.map(e => normName(e.name))).size === 1) add(forms, named[0].name)
  const quality = printed.match(/\b(obvious|synthetic)\b/i)?.[1].toLowerCase(),
    { ends, known } = wordsOf(c, kinds),
    words = name.split(' ')
  words.forEach((w, i) => {
    const lw = w.toLowerCase()
    if (!/^[a-z]{7,}$/.test(lw) || known.has(matchKey(lw))) return
    for (let cut = 3; cut <= lw.length - 3; cut++) {
      if (!ends.has(matchKey(lw.slice(cut)))) continue
      const to = (r: string) => words.map((x, j) => (j === i ? r : x)).join(' ')
      add(forms, to(`${lw.slice(0, cut)} ${lw.slice(cut)}`))
      if (quality) add(forms, `${matchKey(lw.slice(cut))} (${quality})`)
      add(forms, to(lw.slice(cut)))
      break
    }
  })
  for (const [open, close] of groups(printed)) {
    const t = printed.slice(open + 1, close)
    if (!/[,\d/]/.test(t) && t.includes(' ')) add(inner, t)
    // (`<model> form`: the model)
    for (const part of top(t)) add(inner, part.match(/^(.+?)\s+form$/i)?.[1])
  }
  return { forms, inner }
}
/** A gear or augmentation name's entry through its other forms (formsOf): by name first, then a 75% guess; `inner`, the
 *  names in its brackets, by name only. */
export function viaForms(c: Sr6Catalog, name: string, printed: string, kinds: Sr6Kind[], source?: string, inner = false, standard?: { rating?: number }) {
  const f = formsOf(c, name, printed, kinds)
  const by = (how: 'exact' | 'loose' | 'standard') => f.forms.map(n => findEntry(c, n, kinds, source, how, standard?.rating)).find(Boolean)
  const found = inner
    ? f.inner.map(n => findEntry(c, n, kinds, source)).find(Boolean)
    : (by('exact') ?? close(by('loose')) ?? (standard ? close(by('standard'), true) : undefined))
  return found && guess(found, name)
}
/** A link found through another form of the printed name: shown to the GM as the guess it is (an exact hit on a form of the
 *  name is no exact hit on the name). */
export const close = <T extends { match: Sr6NpcMatch } | undefined>(f: T, standard = false) =>
  f && (f.match.score >= 0.9 || (standard && f.match.how === 'standard')) ? f : undefined
export const guess = (f: { entry: Sr6Entry; match: Sr6NpcMatch }, printed: string) =>
  f.match.how === 'exact' ? { entry: f.entry, match: { score: round(nameRatio(matchKey(printed), matchKey(f.entry.name))), how: 'fuzzy' as const } } : f
/** The entry whose name starts with the printed name's first word, when the other words only qualify it: a count, a rating,
 *  a side or quality, or a word of its category or type (`cybereyes obvious`); or when the printed rating is a level of that
 *  family (`linguasoft subscription (rating 4)`: Linguasofts 4; `synaptic accelerator 3`: Synaptic booster 3). `datajack
 *  adapter` is no Datajack. A word of 5 letters at least; the family's standard level. */
export function leadWord(c: Sr6Catalog, name: string, kinds: Sr6Kind[], source?: string, rating?: number) {
  const words = matchKey(name).split(' ')
  if (words.length < 2 || words[0].length < 5) return undefined
  const first = words[0],
    x = indexOf(c)
  const same = kinds.flatMap(k => (x.loose.get(k) ?? []).filter(l => l.key.split(' ')[0] === first))
  const one = same.find(l => l.key === first) ?? (same.length === 1 ? same[0] : undefined)
  if (!one) return undefined
  const known = new Set(matchKey(one.entries.map(e => [e.attrs.category, e.attrs.type].filter(Boolean).join(' ')).join(' ')).split(' '))
  const qualifier = (w: string) => /^\d+$/.test(w) || ['left', 'right', 'obvious', 'synthetic', 'rating', 'level', 'net', 'set'].includes(w) || known.has(w)
  const level = rating != null && one.entries.some(e => Number(e.attrs.level ?? e.attrs.rating) === rating)
  if (!level && !words.slice(1).every(qualifier)) return undefined
  const entry = standardOf(one.entries, prefer(c, source), rating)
  return { entry, match: { score: round(nameRatio(matchKey(name), one.key)), how: 'standard' as const } }
}
/** The entry a shortened name is (`flare comp`: Flare compensation, `lowlight`: Low-light vision, `vision enh`): its words
 *  start the entry's, one for one, or are its first words whole; the shortest such name. Six letters at least. */
export function abbreviated(c: Sr6Catalog, name: string, kinds: Sr6Kind[], source?: string) {
  const words = matchKey(name.replace(/\s*[([][^)\]]*[)\]]\s*$/, '')).split(' '),
    whole = words.join('')
  if (whole.length < 6) return undefined
  const hits = kinds.flatMap(k =>
    (indexOf(c).loose.get(k) ?? []).filter(l => {
      const ws = l.key.split(' ')
      if (words.length === ws.length) return words.every((w, i) => w.length >= 3 && ws[i].startsWith(w))
      if (words.length > ws.length) return false
      // (whole words that begin it, or end it when two: `air tank` is `Internal Air Tank`)
      return (
        words.every((w, i) => w === ws[i]) ||
        (words.length === 1 && ws.join('').startsWith(whole)) ||
        (words.length > 1 && words.every((w, i) => w === ws[ws.length - words.length + i]))
      )
    }),
  )
  const shortest = hits.sort((a, b) => a.key.length - b.key.length)[0]
  return (
    shortest && { entry: prefer(c, source)(shortest.entries), match: { score: round(nameRatio(whole, shortest.key.replace(/ /g, ''))), how: 'fuzzy' as const } }
  )
}
/** The gear or augmentation a printed name is the variant of (`Therapeutic Nanites (Savior System) Nanites`). */
export function viaMid(c: Sr6Catalog, name: string, source?: string) {
  const list = indexOf(c).mids.get(matchKey(name))
  const entry = list && prefer(c, source)(list.slice(0, list.filter(e => /nanites$/i.test(e.name)).length || list.length))
  return entry && guess({ entry, match: { score: 1, how: 'exact' } }, name)
}
/** The entry whose name, category and type together hold all of a printed name's words, in any order (`increased hearing
 *  spectrum`: Increased spectrum hearing; `regulator gauntlets`: the Regulator of type gun gauntlet; `hardened armor module`:
 *  Armor Plating, Hardened, a critter exoframe module): two words at least, and only one entry holds them. */
const wordKey = (t: string) => matchKey(t.replace(/[()[\]]/g, ' '))
export function coveredBy(c: Sr6Catalog, name: string, kinds: Sr6Kind[], source?: string) {
  const words = wordKey(name).split(' ')
  if (words.length < 2 || words.some(w => w.length < 3)) return undefined
  const x = indexOf(c)
  x.words ??= new Map()
  const hits = kinds.flatMap(k => {
    let list = x.words!.get(k)
    if (!list) {
      list = [...(c.entries[k]?.values() ?? [])].map(e => ({
        e,
        have: new Set(wordKey([e.name, e.attrs.category, e.attrs.type].filter(Boolean).join(' ')).split(' ')),
      }))
      x.words!.set(k, list)
    }
    return list.filter(t => words.every(w => t.have.has(w))).map(t => t.e)
  })
  // (a rated family is one: its levels share a name)
  if (new Set(hits.map(e => matchKey(e.name))).size !== 1) return undefined
  const entry = standardOf(hits, prefer(c, source))
  return { entry, match: { score: round(nameRatio(words.join(' '), matchKey(entry.name))), how: 'fuzzy' as const } }
}
/** An add-on printing a list of licences, `licenses (augmentation, pistols, RCC)` or `fake licenses 3 (firearms, magic)`, as
 *  one licence each. */
export const licences = (a: string): string[] => {
  const list = a.match(/^(?:fake\s+)?licen[sc]es?(?:\s+\d+)?\s*[([]([^)\]]*)[)\]]$|^licen[sc]es?:\s*(.+)$/i)
  return list ? (list[1] ?? list[2]).split(/\s*,\s*/).map(w => (/licen[sc]e$/i.test(w) ? w : `${w.trim()} license`)) : [a]
}
/** A licence a stat block prints by what it covers, as the owner ruled (2026-10-22): `augmentation` and `bioware` the generic
 *  augmentation licence (the catalog's if it has one, else plain gear), its detail what the NPC has; `pistols` the Firearm
 *  license, `magic` the Spellcasting license, `RCC` the Rigger remote console license, the printed word kept as detail. */
const LICENCE_RULINGS = new Map<string, string>([
  ['augmentation', ''],
  ['augmentations', ''],
  ['bioware', ''],
  ['pistols', 'Firearm license'],
  ['magic', 'Spellcasting license'],
  ['rcc', 'Rigger remote console license'],
])
/** A licence add-on as a thing: by the rulings, else by its catalog name, else plain gear. `generic` is set for an augmentation
 *  licence, whose detail npcThings fills in from what the NPC has. */
export function licenceThing(c: Sr6Catalog, part: string, printed: string): { thing: Sr6NpcThing; generic?: string } {
  const said = printed.match(/^([\w'’]+)\s+licen[sc]e$/i)?.[1],
    word = said?.toLowerCase()
  const ruled = word === undefined ? undefined : LICENCE_RULINGS.get(word)
  const base = { part, printed, printedName: printed, values: {}, accessories: [] }
  if (ruled) {
    const f = licenceNamed(c, ruled)
    if (f) return { thing: { ...base, name: f.entry.name, kind: f.entry.kind, entry: f.entry, match: { score: 1, how: 'fuzzy' }, detail: said, ruled: true } }
  }
  if (word !== undefined && ruled === '') {
    const entry = [...(c.entries.licencetypes?.values() ?? [])].find(e => /^augmentation licen/i.test(e.name))
    const thing: Sr6NpcThing = entry
      ? { ...base, name: entry.name, kind: entry.kind, entry, match: { score: 1, how: 'fuzzy' }, ruled: true }
      : { ...base, name: 'Augmentation license', kind: 'gear', ruled: true }
    return { thing, generic: said }
  }
  const f = licenceNamed(c, printed)
  return {
    thing: f
      ? { ...base, name: f.entry.name, kind: f.entry.kind, entry: f.entry, match: f.match }
      : { ...base, name: printed.replace(/\s*[([].*$/, ''), kind: 'gear' },
  }
}
/** A licence by its name only (`Cyberware license`); a guess at one would be another licence (`bioware license`). */
const licenceNamed = (c: Sr6Catalog, a: string) => {
  const key = matchKey(a)
  const entry = [...(c.entries.licencetypes?.values() ?? [])].find(e => matchKey(e.name) === key)
  return entry && { entry, match: { score: 1, how: 'exact' as const } }
}
/** An initialism for an armor add-on (`AAS`: Securetech Armor Augmentation System, Defense +1): of the armors with those
 *  initials the one whose Defense is a plus (a bonus on the armor it is fitted to, cumulative), when only one is. */
export function addOnInitialism(c: Sr6Catalog, name: string, host: Sr6Entry | undefined) {
  const initials = host?.kind === 'armor' ? name.match(/^([A-Z]{3,6})$/)?.[1].toLowerCase() : undefined
  const adds = (initials ? (indexOf(c).initials.get(initials) ?? []) : []).filter(e => e.kind === 'armor' && /^\+/.test(e.attrs.defense ?? ''))
  return adds.length === 1 ? { entry: adds[0], match: { score: 1, how: 'fuzzy' as const }, ruled: true } : undefined
}
/** A gear or augmentation name in every kind a stat block can print (owner: search them all) when its own kinds have none. */
export function inAnyKind(c: Sr6Catalog, name: string, printed: string, source?: string, rating?: number) {
  return (
    findEntry(c, name, GEAR_KINDS, source) ??
    viaForms(c, name, printed, GEAR_KINDS, source) ??
    findEntry(c, name, GEAR_KINDS, source, 'loose') ??
    viaForms(c, name, printed, GEAR_KINDS, source, true) ??
    coveredBy(c, name, GEAR_KINDS, source) ??
    leadWord(c, name, GEAR_KINDS, source, rating)
  )
}
const normsOf = (c: Sr6Catalog) => (indexOf(c).norms ??= GEAR_KINDS.flatMap(k => [...(c.entries[k]?.values() ?? [])].map(e => ({ e, n: normName(e.name) }))))
/** A gear or augmentation printed as several things, when it is none: a list in a bracket of what a family prints
 *  (`genotype enhancements (Alpha Factor, Qualia)`: each its entry's name), `personal inhaler (jazz, novacoke, 1 dose each)`,
 *  `commlink and smartglasses (device rating 7)` and `biomonitor/killswitch` when each part is an entry. */
export function expandStuff(c: Sr6Catalog, printed: string, source?: string): string[] {
  // (a part is only taken as a thing by name or a close guess: a split into wrong links is worse than one unlinked)
  const part = (n: string) => {
    const f = findEntry(c, n, GEAR_KINDS, source) ?? findEntry(c, n, GEAR_KINDS, source, 'loose')
    return (!!f && f.match.score >= 0.9) || !!viaForms(c, n, n, GEAR_KINDS, source)
  }
  const last = groups(printed).at(-1),
    tail = last && last[0] > 0 && last[1] === printed.length - 1 ? last : undefined,
    name = (tail ? printed.slice(0, tail[0]) : printed).trim(),
    list = tail ? top(printed.slice(tail[0] + 1, -1)) : []
  const delivery = name.match(/^(?:personal\s+)?(?:inhalers?|syringes?|injectors?)$/i)
  if (delivery && list.length) return list.filter(t => !/^\d/.test(t))
  // (only a name that could be several things is looked up further)
  if (list.length < 2 && !/\s+and\s+|[a-z]{2}\/[a-z]/i.test(name)) return [printed]
  if (findEntry(c, name, GEAR_KINDS, source)) return [printed]
  const stem = matchKey(name)
  if (list.length > 1) {
    const names = list.map(p => {
      const key = normName(`${stem} ${p}`)
      let best: { e: Sr6Entry; score: number } | undefined
      for (const { e, n } of normsOf(c)) {
        const score = n.startsWith(`${stem} `) ? nameRatio(key, n) : 0
        if (score >= 0.85 && score > (best?.score ?? 0)) best = { e, score }
      }
      return best?.e.name
    })
    if (names.every(Boolean)) return names as string[]
  }
  // a package that is none and lists parts that all are (`metahuman control package (skilljack 6, skillwires 6)`): itself, then its parts
  if (list.length > 1 && !findEntry(c, name, GEAR_KINDS, source, 'loose') && !viaForms(c, name, name, GEAR_KINDS, source) && list.every(p => part(p)))
    return [name, ...list]
  const parts = name.split(/\s+and\s+|(?<=[a-z]{2})\/(?=[a-z])/i)
  // (the bracket after them is theirs both, unless it is an armor value of the two together: `armor vest and lined coat (+3)`)
  const shared = tail && !/^\(\s*\+/.test(printed.slice(tail[0])) ? ` ${printed.slice(tail[0])}` : ''
  if (parts.length > 1 && parts.every(p => part(p.replace(/^an?\s+/i, '')))) return parts.map(p => `${p.replace(/^an?\s+/i, '')}${shared}`)
  return [printed]
}
