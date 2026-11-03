// SR6 creation rules: dependencies between optional rules (RULE_DEPS), presets, and applying them (see creation.ts).
import { SR6_METHODS } from '../../formats/domain/character'
import { type CreationRules, type CreationSetting, type CreationValue } from './creation-types'
import { AWAKENED, CREATION_KEYS } from './creation-keys'
import { LEVELS, SETS } from './creation-levels'

/** Nested optional rules (the books' pages: book-rules-implemented.md, "Nested optional rules"): requires, the settings
 *  that must be on (a true/false one true, any other set) for this one to apply; conflicts, the ones that can't be on with
 *  it (each pair once: conflictsOf reads both ways); replaces, the settings it stands in for while on (shown; the rule's
 *  own code does it). A rule whose parent is off keeps its stored value but doesn't apply (applyDeps). */
export interface RuleDeps {
  requires?: string[]
  conflicts?: string[]
  replaces?: string[]
}
export const LEVEL_KEYS = ['levelStreet', 'levelPrime', 'levelSwcStreet', 'levelSwcElite']
export const RULE_DEPS: Record<string, RuleDeps> = {
  // one level of play at a time (CRB Hong Kong p. 63: street level and, "on the other end", prime runner; SWC p. 14:
  // street-level or elite)
  ...Object.fromEntries(LEVEL_KEYS.map((k, i) => [k, { conflicts: LEVEL_KEYS.slice(i + 1) }])),
  levelSwcElite: { replaces: ['maxAvailability'] },
  ...Object.fromEntries(
    ['sumToTen', 'pointBuy', 'modules', 'letters'].flatMap(s => [
      [`swcStreet.${s}`, { requires: ['levelSwcStreet'] }],
      [`swcElite.${s}`, { requires: ['levelSwcElite'] }],
    ]),
  ),
  // the Karma build's starting karma at a level of play (it needs the Karma build option too)
  'swcStreet.karmaBuild': { requires: ['levelSwcStreet', 'karmaBuildMethod'] },
  'swcElite.karmaBuild': { requires: ['levelSwcElite', 'karmaBuildMethod'] },
  // SWC p. 161: "Instead of a flat limit of Charisma ... use the following rules"
  ...Object.fromEntries(['contactKarma', 'contactPairPerCha', 'contactRatingMax'].map(k => [k, { requires: ['expandedContacts'] }])),
  twentyQuestionsKarma: { requires: ['twentyQuestions'] }, // SWC p. 25
  // SWC p. 144: 2 Edge for twice the core rulebook's lead (HK p. 45)
  stackingAdvantage: { requires: ['arDrEdgeGap'] },
  infectedPowersAtCreation: { requires: ['infectedAllowed'] },
  animalismMaxAtCreation: { requires: ['allowAnimalism'] },
  // SWC p. 150: "add Agility to Attack Rating in place of Strength"
  strengthInCloseCombat: { replaces: ['meleeArStrength'] },
  strengthDamageStep1: { requires: ['highStrengthDamage'] },
  strengthDamageStep2: { requires: ['highStrengthDamage'] },
  // SWC p. 153
  'advance.karmaToNuyenRate': { requires: ['workingForTheMan'] },
  'advance.nuyenToKarmaRate': { requires: ['workingForThePeople'] },
  unrestrictedSkillRanks: { replaces: ['advance.skillMax'] },
  // the owner's decisions (2026-10-11): a toggle with the values the GM sets under it
  ...Object.fromEntries(
    [
      ['ownCarryOver', ['carryOver.karma', 'carryOver.nuyen']],
      ['karmaToNuyenCap', ['karmaToNuyenMax']],
      ['positiveQualityMultiplier', ['positiveQualityFactor']],
      ['buyPowerPoints', ['advance.powerPoint']],
      [
        'karmaBuildMethod',
        [
          'karmaBuild.start',
          'karmaBuild.startRating',
          'karmaBuild.freeSpellsPerMagic',
          'karmaBuild.freeFormsPerResonance',
          ...AWAKENED.map(k => `magicKarma:${k}`),
        ],
      ],
      ['dataStructureCaps', ['dataStructure.maxCount', 'dataStructure.maxRating']],
      ['gradeCapAtCreation', ['gradeCap.initiation', 'gradeCap.submersion', 'gradeCap.transhuman']],
      ['restrictMethods', SR6_METHODS.map(m => `methodAllowed.${m}`)],
    ].flatMap(([parent, kids]) => (kids as string[]).map(k => [k, { requires: [parent as string] }])),
  ),
  eliteSumToThirteen: { requires: ['levelSwcElite'] },
}
for (const [l, pairs] of LEVELS) RULE_DEPS[l] = { ...RULE_DEPS[l], replaces: [...pairs.map(([k]) => k), ...(RULE_DEPS[l]?.replaces ?? [])] }
for (const [t, key] of SETS) RULE_DEPS[t] = { ...RULE_DEPS[t], replaces: [key] }

/** The rule presets of the table setup page: a named set of the toggles above, applied to the form for review (choosing one
 *  sets them; Save keeps them). `settings` are the values the preset sets; every other setting a preset manages
 *  (PRESET_KEYS) goes back to the standard. Standard changes nothing about the maths: the standard values. Configurable
 *  is the table's own, nothing preset. Not modelled: Shadowrun Missions' limit of 1 transhuman grade (the app has no
 *  transhuman grades). */
export interface RulePreset {
  id: 'standard' | 'seattle' | 'missions' | 'configurable'
  label: string
  about: string
  settings: Record<string, CreationValue>
}
export const RULE_PRESETS: RulePreset[] = [
  { id: 'standard', label: 'Standard', about: 'The standard values for the settings the presets manage', settings: {} },
  { id: 'seattle', label: 'Standard (Seattle)', about: 'Standard, with Strength added to a melee weapon’s Attack Rating', settings: { meleeArStrength: true } },
  {
    id: 'missions',
    label: 'Shadowrun Missions',
    about:
      'Gear up to Availability 7, initiation grade 1 and submersion grade 2 at most at creation, only priority, sum-to-ten and point buy, expanded specializations',
    settings: {
      availabilitySeven: true,
      gradeCapAtCreation: true,
      'gradeCap.initiation': 1,
      'gradeCap.transhuman': 1,
      transhumanism: true,
      'gradeCap.submersion': 2,
      expandedSpecializations: true,
      restrictMethods: true,
      ...Object.fromEntries(SR6_METHODS.map(m => [`methodAllowed.${m}`, ['priority', 'sumtoten', 'pointbuy'].includes(m)])),
    },
  },
  { id: 'configurable', label: 'Configurable', about: 'Nothing preset: every setting is the table’s own', settings: {} },
]
/** Every setting a preset sets: choosing a preset puts these to its value, or back to the standard. */
export const PRESET_KEYS = [...new Set(RULE_PRESETS.flatMap(p => Object.keys(p.settings)))]
/** What choosing preset `id` does to the form: values to set, keys back to the standard (none for Configurable). */
export function presetChanges(id: RulePreset['id']): { set: [string, CreationValue][]; reset: string[] } {
  const p = RULE_PRESETS.find(x => x.id === id)
  if (!p || p.id === 'configurable') return { set: [], reset: [] }
  return { set: Object.entries(p.settings), reset: PRESET_KEYS.filter(k => !(k in p.settings)) }
}

/** The settings that can't be on with `key`, both ways. */
export const conflictsOf = (key: string) => [...(RULE_DEPS[key]?.conflicts ?? []), ...Object.keys(RULE_DEPS).filter(k => RULE_DEPS[k].conflicts?.includes(key))]
/** A setting that is on: set, and not false. */
export const isOn = (s?: CreationSetting) => s !== undefined && s.value !== false
/** Why `key` doesn't apply with these rules: a parent it needs is off, or a rule it can't be on with is on. */
export function blockedBy(cr: CreationRules, key: string): { needs: string } | { conflicts: string } | undefined {
  const needs = RULE_DEPS[key]?.requires?.find(p => !isOn(cr.get(p)))
  if (needs) return { needs }
  const other = conflictsOf(key).find(k => isOn(cr.get(k)))
  return other ? { conflicts: other } : undefined
}
export const ORDER = new Map(CREATION_KEYS.map((k, i) => [k.key, i]))
/** The rules with every nested rule whose parent is off left out, and of two conflicting rules on only one: the locked
 *  one, else the runner's own, else the one Table setup lists first. */
export function applyDeps(cr: CreationRules): CreationRules {
  const out: CreationRules = new Map(cr),
    rank = (s: CreationSetting) => (s.lockedBy ? 2 : s.from === 'runner' ? 1 : 0)
  for (const k of [...out.keys()].sort((a, b) => (ORDER.get(a) ?? 1e9) - (ORDER.get(b) ?? 1e9))) {
    const s = out.get(k)
    if (!isOn(s)) continue
    for (const c of conflictsOf(k)) {
      const o = out.get(c)
      if (isOn(o)) out.delete(rank(o!) > rank(s!) ? k : c)
    }
  }
  for (let changed = true; changed;) {
    changed = false
    for (const k of [...out.keys()])
      if (RULE_DEPS[k]?.requires?.some(p => !isOn(out.get(p)))) {
        out.delete(k)
        changed = true
      }
  }
  return out
}
