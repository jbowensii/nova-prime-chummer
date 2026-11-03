// SR6 creation rules: the about/description table (ABOUT) and aboutOf (see creation.ts).
import { SR6_METHODS, SR6_METHOD_LABELS } from '../../formats/domain/character'
import { CL6_ONLY_KEY } from './creation-types'
import { cap } from './creation-keys'

/** What each setting does, in plain words, and where a book prints it, else "house rule" or "option" (owner, 2026-10-11):
 *  the hover text of its row on Table setup and on a runner's Creation rules. Never names another app, but the Karma build's (KARMA_BUILD). [what, where] */
export const HK = (p: number | string) => `CRB Hong Kong p. ${p}`,
  SWC = (p: number | string) => `Sixth World Companion p. ${p}`
export const HOUSE = 'house rule',
  OPTION = 'option',
  NF_ERRATA = 'No Future errata, NF p. 162'
// (owner, one-off exception, 2026-10-11: the one place another app is named) the Karma build option's numbers are the ones
// that app starts a Karma build from, since no SR6 book prints one
export const KARMA_BUILD = 'option (Commlink6 defaults)',
  NO_BOOK = 'no SR6 book prints a Karma build'
export const ABOUT: Record<string, [string, string]> = {
  startingKarma: ['The customization Karma every runner starts with; a prime runner doubles it', HK(66)],
  qualityNetBonusCap: ['The most Karma negative qualities may give beyond what the positive ones cost', HK(66)],
  qualityMaxCount: ['The most qualities a runner takes at creation; its metatype’s own traits never count', HK(66)],
  oneAttributeAtMax: ['Only one Physical or Mental attribute may be at its metatype maximum', HK(63)],
  attributeBaseMax: ['Adjustment points go only on an attribute whose metatype maximum is above this, and on Edge, Magic and Resonance', HK(63)],
  skillCap: ['The highest rank a skill may have at creation', HK(65)],
  skillCapAptitude: ['The highest rank of the skill an Aptitude quality names', HK(65)],
  aptitudeQuality: ['The catalog’s Aptitude quality: the skill its note names may go one rank higher; never on the skill an Incompetent names', HK(70)],
  exceptionalQuality: ['The catalog’s Exceptional (Attribute) quality: +1 to the maximum of the attribute its note names, once per attribute', HK(71)],
  incompetentQuality: ['The catalog’s Incompetent (Skill) quality: no ranks in the skill its note names; never on the skill an Aptitude names', HK('76–77')],
  sensitiveSystemQuality: ['The catalog’s Sensitive System quality: no Magic or Resonance, and ware Essence times the factor', HK(78)],
  improvedAbilityPower: ['The catalog’s Improved Ability adept power: the skill its note names, boosted at most to the factor', HK(157)],
  mentorSpiritQuality: [
    'The catalog’s Mentor Spirit quality: choosing a mentor spirit on the Magic tab adds it with its Karma, and removing it removes the mentor spirit',
    HK(73),
  ],
  languageMax: [
    'The highest level any language reaches; the Native language counts as this level and no other goes above it; one Native language only (a second Native only with Bilingual)',
    HK('67, 99'),
  ],
  fociForcePerMagic: ['The foci’s Force added together is at most Magic times this; no more foci than Magic, none of Force above it', HK(154)],
  fociBondKarma: ['A focus costs its bonding Karma out of the customization Karma', HK('154, 168')],
  improvedAbilityFactor: ['Improved Ability raises its skill to at most its rank times this, rounded up', HK(157)],
  sensitiveSystemEssence: ['Sensitive System multiplies cyberware, bioware and nanoware Essence by this', HK(78)],
  attributeMaxFloor: ['The lowest a quality (Impaired) lowers an attribute’s maximum to', HK(76)],
  manyTalentsQuality: ['The catalog’s Many Talents quality: two attributes may be at their maximum', SWC(134)],
  manySkillsQuality: ['The catalog’s Many Skills quality: two skills may be at the highest rank', SWC(134)],
  availabilityCapIllegalOnly: [
    'On: the Availability cap holds only illegal gear, as the first printing read it; off: every item is capped',
    'the core rulebook’s 2019 printing p. 66',
  ],
  oneSkillAtMax: ['Only one skill may be at the highest rank at creation', HK(65)],
  karmaSpellsAtCreation: [
    'On: spells, rituals and complex forms past the free ones can be bought with the customization Karma; off: they can’t, as the later printings say',
    'the core rulebook’s 2019 printing p. 68',
  ],
  skillPointsSpec: ['Skill points a specialization costs at creation', HK(65)],
  skillPointsExpertise: [
    'Skill points an expertise costs at creation, in place of its Karma price; off: bought with Karma. The book disagrees with itself: p. 65 says no expertise with skill points at creation, p. 68 prices one',
    'book discrepancy, CRB Hong Kong pp. 65, 68',
  ],
  magicMax: ['The highest Magic or Resonance at creation', HK(65)],
  essence: ['The Essence every runner starts with', HK(38)],
  contactPointsPerCha: ['Contact points per point of Charisma', HK(67)],
  knowledgePerLog: ['Free Knowledge points per point of Logic', 'CRB p. 97'],
  maxAvailability: ['The highest Availability of gear bought at creation', HK(66)],
  maxNuyenLeft: ['The most nuyen kept after creation; more is a problem a GM can approve', HK(68)],
  freeSpellsPerMagic: ['Free spells and rituals per point of Magic', HK(65)],
  freeFormsPerResonance: ['Free complex forms per point of Resonance', HK(66)],
  maxKarmaLeft: ['The most Karma kept after creation; more is a problem a GM can approve', HK(66)],
  ownCarryOver: ['On: the GM’s own limits below replace the book’s 5 Karma and 5,000 nuyen kept after creation', HOUSE],
  'carryOver.karma': ['The most Karma kept after creation, with the GM’s own limits on', HOUSE],
  'carryOver.nuyen': ['The most nuyen kept after creation, with the GM’s own limits on', HOUSE],
  expandedContacts: ['On: Karma buys contact points past the pool and past a contact’s pair cap, up to the rating below', SWC(161)],
  contactKarma: ['Expanded contacts: Karma per contact point past the pool or past a contact’s pair cap', SWC(161)],
  contactPairPerCha: ['Expanded contacts: a contact’s connection + loyalty up to Charisma times this before Karma pays', SWC(161)],
  contactRatingMax: ['Expanded contacts: the highest connection or loyalty', SWC(161)],
  karmaAttrPerRank: ['Karma for an attribute rank: this times the new rating', HK(68)],
  karmaSkillPerRank: ['Karma for a skill rank: this times the new rank', HK(68)],
  karmaSpec: ['Karma for a specialization', HK(68)],
  karmaKnowledge: ['Karma for a knowledge or language rank', HK(68)],
  karmaSpell: ['Karma for a spell or ritual past the free ones', HK(68)],
  karmaForm: ['Karma for a complex form past the free ones', HK(68)],
  karmaInitiationBase: ['Karma for an initiation or submersion grade: this base', HK(68)],
  karmaInitiationPerGrade: ['Karma for an initiation or submersion grade: plus this times the new grade', HK(68)],
  positiveQualityMultiplier: ['On: positive qualities cost their Karma times the factor below at creation; off: their printed Karma', OPTION],
  positiveQualityFactor: ['The factor positive qualities’ Karma is multiplied by, with the multiplier on', OPTION],
  karmaMartialArt: ['Karma for a martial arts style (it comes with its signature technique)', 'Firing Squad p. 97'],
  karmaTechnique: ['Karma for a martial arts technique past a style’s signature one', 'Firing Squad p. 97'],
  'advance.expertise': ['Karma for an expertise (at creation too, when skill points don’t pay for it)', HK(68)],
  'advance.expertiseRank': ['The lowest skill rank an expertise needs', HK(68)],
  'advance.qualityFactor': ['A positive quality taken after creation costs its Karma times this', HK(69)],
  'advance.buyOffFactor': ['Buying off a negative quality costs its Karma times this', HK(69)],
  'advance.skillMax': ['The highest skill rank after creation', HK(65)],
  buyPowerPoints: [
    'On: a mystic adept buys power points after creation for the Karma below; off: only in place of a metamagic at initiation, as the book has it (CRB Hong Kong p. 168)',
    HOUSE,
  ],
  'advance.powerPoint': ['Karma per power point a mystic adept buys after creation, with the rule on', HOUSE],
  'advance.karmaToNuyenRate': ['Working for the Man: nuyen a Karma turns into after creation', SWC(153)],
  'advance.nuyenToKarmaRate': ['Working for the People: nuyen that turns into a Karma after creation', SWC(153)],
  karmaToNuyenRate: ['Nuyen a Karma turns into at creation', HK(66)],
  karmaToNuyenRateInDebt: ['Nuyen a Karma turns into at creation with the In Debt quality', HK(66)],
  inDebtQuality: ['The catalog’s In Debt quality, which changes the Karma-to-nuyen rate', HK(77)],
  stolenGearQuality: ['The catalog’s Stolen Gear quality (0 Karma), which changes the Karma-to-nuyen rate and limit; never with In Debt', NF_ERRATA],
  karmaToNuyenRateStolenGear: ['Nuyen a Karma turns into at creation with Stolen Gear', NF_ERRATA],
  karmaToNuyenMaxStolenGear: ['The most Karma turned into nuyen with Stolen Gear, at any rate (refused at creation; after it, a Review warning)', NF_ERRATA],
  stolenGearBuyOff: ['Karma to buy off one Karma of Stolen Gear’s conversion after creation (bought off a part at a time)', NF_ERRATA],
  karmaToNuyenCap: [
    'On: the Karma turned into nuyen at creation is limited to the number below; off: no limit, as the book prints none (CRB Hong Kong p. 66)',
    HOUSE,
  ],
  karmaToNuyenMax: ['The most Karma turned into nuyen at creation, with the limit on', HOUSE],
  dataStructureNuyen: ['Nuyen per level a data structure costs to buy; its Karma, equal to its level, pays to integrate it (p. 71)', 'Hack & Slash p. 72'],
  fakeSinPerRating: ['Nuyen per rating of a fake SIN', HK(273)],
  licencePerRating: ['Nuyen per rating of a fake licence', HK(273)],
  sumToTenTarget: ['Sum to ten: the priority letters’ values add up to at most this', SWC(27)],
  'pointBuy.total': ['Point buy: the character points a runner has', SWC(28)],
  'pointBuy.awakened': ['Point buy: character points to be awakened or emerged', SWC(29)],
  'pointBuy.cost.attribute': ['Point buy: character points per attribute point', SWC(29)],
  'pointBuy.cost.skill': ['Point buy: character points per skill point', SWC(29)],
  'pointBuy.cost.adjustment': ['Point buy: character points per adjustment point', SWC(29)],
  'pointBuy.cost.powerPoint': ['Point buy: character points per power point', SWC(29)],
  'pointBuy.cost.mysticPowerPoint': ['Point buy: character points per power point for a mystic adept', SWC(29)],
  'pointBuy.cost.spell': ['Point buy: character points per spell', SWC(29)],
  'pointBuy.cost.complexForm': ['Point buy: character points per complex form', SWC(29)],
  'pointBuy.nuyenPerCp': ['Point buy: nuyen per character point', SWC(29)],
  'pointBuy.oneSpecialization': ['Point buy: only one specialization at creation', SWC(29)],
  karmaBuildMethod: [
    'On: the Karma build can be picked as a creation method, with the numbers below; off: it can’t. No SR6 book prints a Karma build',
    KARMA_BUILD,
  ],
  'karmaBuild.start': [`Karma build: the Karma a runner starts with, to buy everything; ${NO_BOOK}`, KARMA_BUILD],
  'karmaBuild.startRating': [
    `Karma build: the Magic or Resonance an awakened or emerged runner starts at, before raising it with Karma; ${NO_BOOK}`,
    KARMA_BUILD,
  ],
  'karmaBuild.freeSpellsPerMagic': [
    `Karma build: free spells and rituals per point of Magic (0: every one costs its Karma, as the Karma prices have it); ${NO_BOOK}`,
    KARMA_BUILD,
  ],
  'karmaBuild.freeFormsPerResonance': [`Karma build: free complex forms per point of Resonance (0: every one costs its Karma); ${NO_BOOK}`, KARMA_BUILD],
  'swcStreet.karmaBuild': [`Street-level with the Karma build: the Karma a runner starts with, in place of the standard level's; ${NO_BOOK}`, KARMA_BUILD],
  'swcElite.karmaBuild': [`Elite with the Karma build: the Karma a runner starts with, in place of the standard level's; ${NO_BOOK}`, KARMA_BUILD],
  'lifepath.moduleCount': ['Lifepath: the adult life modules a runner takes', SWC(32)],
  'lifepath.contactRatingCap': ['Lifepath: the highest contact rating', SWC(31)],
  'lifepath.bestAttributeBonus': ['Lifepath: the best attribute goes up by this, up to its maximum', SWC(32)],
  'lifepath.repeatModules': ['Lifepath: adult modules that may be taken twice', SWC(32)],
  'lifepath.contactKarma': ['Lifepath: Karma per contact rating the contact points don’t cover', SWC(31)],
  'lifepath.raisedAttributeStart': ['Lifepath: an attribute whose metatype maximum is raised starts at this', SWC(32)],
  'lifepath.mundaneEdge': ['Lifepath: Edge a runner neither awakened nor emerged gains', SWC(32)],
  monitorBase: ['Condition monitor boxes before the attribute’s share', HK(38)],
  monitorDivisor: ['A condition monitor adds its attribute divided by this, rounded up', HK(38)],
  initiativeDice: ['Initiative dice a runner rolls before augmentations', HK(67)],
  initiativeDiceMax: ['Never more initiative dice than this', HK(39)],
  astralInitiativeDice: ['Astral initiative dice', HK(161)],
  specDice: ['Dice a specialization adds', HK(92)],
  expertiseDice: ['Dice an expertise adds', HK(92)],
  untrainedPenalty: ['Dice off an attribute for a skill without ranks', HK(93)],
  overflowPerBody: ['Damage Overflow boxes per point of Body', HK(121)],
  attributeAugmentMax: ['An attribute’s augmented value is at most its natural one plus this', HK(37)],
  skillAugmentMax: ['A skill’s dice pool is raised by bonuses at most this much', HK(39)],
  monitorMinimum: ['The fewest boxes a quality (Glass Jaw) lowers a condition monitor to', HK(76)],
  matrixColdDice: ['VR cold sim: initiative dice added to the usual one', HK(179)],
  matrixHotDice: ['VR hot sim: initiative dice added to the usual one', HK(179)],
  moveWalk: ['Metres a Move covers', HK(42)],
  moveSprint: ['Metres a Sprint covers before its hits', HK(44)],
  moveSprintPerHit: ['Metres a Sprint adds per hit', HK(44)],
  unarmedDV: ['Base unarmed Damage Value (Stun)', HK(94)],
  arDrEdgeGap: ['An Attack Rating this far ahead of the Defense Rating (or the reverse) gains a point of Edge', HK(45)],
  meleeArStrength: ['Strength adds to a melee weapon’s Attack Rating', HK(39)],
  builtToughQuality: ['The catalog’s Built Tough quality: a Physical box per level', HK(70)],
  dermalDepositsQuality: ['The catalog’s Dermal Deposits quality: +1 Defense Rating, Physical unarmed damage', HK(71)],
  charismaticDefenseQuality: ['The catalog’s Charismatic Defense quality: Defense Rating from Charisma instead of Body', 'Power Plays p. 85'],
  levelStreet: ['On: each priority gives the values of the row below it (E stays E)', HK(63)],
  levelPrime: ['On: twice the customization Karma', HK(63)],
  levelSwcStreet: ['On: street-level letters, targets and module count below; no illegal gear but cyberdecks', SWC('14–15')],
  'swcStreet.letters': ['Street-level: the priority letters (B, C, C, D, E)', SWC(14)],
  'swcStreet.sumToTen': ['Street-level: sum-to-eight', SWC(15)],
  'swcStreet.pointBuy': ['Street-level: the character points', SWC(15)],
  'swcStreet.modules': ['Street-level: the adult life modules', SWC(15)],
  levelSwcElite: ['On: elite letters, targets and module count below; no Availability cap', SWC(15)],
  'swcElite.letters': ['Elite: the priority letters (A, B, B, C, D)', SWC(15)],
  'swcElite.sumToTen': ['Elite: sum-to-twelve', SWC(15)],
  'swcElite.pointBuy': ['Elite: the character points', SWC(15)],
  'swcElite.modules': ['Elite: the adult life modules', SWC(15)],
  eliteSumToThirteen: ['On, with Elite: sum-to-thirteen, the total of Elite’s own letters, instead of the sum-to-twelve the book prints', HOUSE],
  priorityLetters: ['The priority letters a runner takes, one a column (A, B, C, D and E once each)', HK(63)],
  stackingAdvantage: ['On: a lead of twice the Edge gap gains 2 Edge', SWC(144)],
  strengthInCloseCombat: ['On: Close Combat rolls Strength, and Agility goes into a melee Attack Rating in place of Strength', SWC(150)],
  highStrengthDamage: ['On: high Strength adds to melee and unarmed Damage Values at the steps below', SWC(150)],
  strengthDamageStep1: ['High Strength: the Strength that adds +1 Damage Value', SWC(150)],
  strengthDamageStep2: ['High Strength: the Strength that adds +2 Damage Value', SWC(150)],
  alternateMysticAdept: ['On: a mystic adept gets half a power point per point of Magic, and no Conjuring or Enchanting', SWC(148)],
  twentyQuestions: ['On: Karma at creation for answering ten of the twenty questions', SWC(25)],
  twentyQuestionsKarma: ['Twenty Questions: the Karma it gives', SWC(25)],
  workingForTheMan: ['On: a week of downtime turns Karma into nuyen after creation, at the rate under Advancement', SWC(153)],
  workingForThePeople: ['On: a week of downtime turns nuyen into Karma after creation, at the rate under Advancement', SWC(153)],
  expandedSpecializations: ['On: any number of specializations a skill (still one expertise)', SWC(153)],
  unrestrictedSkillRanks: ['On: no highest skill rank after creation (never at creation)', SWC(153)],
  suprathyroidStacks: ['On: the suprathyroid gland’s bonuses stack with other augmentations’ (the +4 cap still holds)', SWC(149)],
  infectedAllowed: [
    'On: a runner may take the Infected qualities and buy the Infected optional powers with Karma, at creation and after; off: they are hidden from the pickers and refused',
    SWC(104),
  ],
  infectedPowersAtCreation: [
    'On: an Infected runner may buy its type’s optional powers at creation; off: only its one free pick at creation, the rest after (“in general”, p. 105)',
    SWC(105),
  ],
  [CL6_ONLY_KEY]: [
    'On: the catalog also loads the optional data set the admin put in custom/sr6/cl6only/ (records no book prints, each under a source of its own marked Non-canon); off: nothing from it loads. Only the server’s setting counts',
    OPTION,
  ],
  exoticFirstSpecFree: ['On: the first Exotic Weapons specialization costs no skill points or Karma', HOUSE],
  mentorBothAdvantages: [
    'On: a mystic adept gets both the magician’s and the adept’s advantages of its mentor spirit; off: it picks one, for good (CRB Hong Kong pp. 162–163)',
    HOUSE,
  ],
  dataStructureCaps: ['On: Review flags a technomancer’s data structures past the count or level below, a problem a GM can approve', HOUSE],
  'dataStructure.maxCount': ['The most data structures a runner has at creation, with the caps on', HOUSE],
  'dataStructure.maxRating': ['The highest data structure level at creation, with the caps on', HOUSE],
  noUsedCulturedBioware: ['On: cultured bioware can’t be used (or omega) grade; off: it can, as the books print no exclusion', HOUSE],
  restrictMethods: ['On: a runner can only be built with the creation methods allowed below (the table’s own limit, for organised play, say)', HOUSE],
  ...Object.fromEntries(SR6_METHODS.map(m => [`methodAllowed.${m}`, [`${SR6_METHOD_LABELS[m]} may be picked while the limit on methods is on`, HOUSE]])),
  gradeCapAtCreation: [
    'On: Review flags an initiation or submersion grade at creation above the caps below, a problem a GM can approve (a grade is never above Magic or Resonance anyway)',
    HOUSE,
  ],
  'gradeCap.initiation': ['The highest initiation grade at creation, with the caps on', HOUSE],
  'gradeCap.submersion': ['The highest submersion grade at creation, with the caps on', HOUSE],
  'gradeCap.transhuman': ['The highest transhumanist grade at creation, with the caps on', HOUSE],
  transhumanism: [
    'On: a mundane runner buys transhumanist grades for 10 + the next grade in Karma (the initiation price), up to 20, and each gives an Essence hole of 1.0 that augmentations’ Essence is paid from first; off: none',
    SWC(146),
  ],
  allowAnimalism: [
    'On: a runner may buy animalism powers, 10 + the grade in Karma each grade, outside initiation (mundanes too); off: they are refused at creation',
    'Bestial Nature p. 21',
  ],
  animalismMaxAtCreation: ['The highest animalism grade at creation (2 when unset)', 'Bestial Nature p. 21'],
  allowSurge: ['On: a runner may take metagenic qualities (at most 30 Karma of them) and a SURGE collective; off: they are refused at creation', SWC(116)],
  adjustOnLoweredMax: [
    'On: adjustment points may also go on an attribute whose metatype maximum is lowered; off: only on raised maxima, Edge, Magic and Resonance (CRB Hong Kong p. 63)',
    HOUSE,
  ],
  knowledgeLogicIntuition: ['Optional rule (CRB p. 98): free Knowledge points = (Logic + Intuition) × 2; off (default): Logic only (p. 97)', HK(98)],
  metatypeSizePricing: [
    'On: the PRICEMOD data apply, as one line of the nuyen budget: the metatype’s (troll-sized +10% on everything bought, dwarf-sized +10% on armor), and the qualities’ and ware’s (Shiva Arms, Bone Spikes, Thorns, bark: more on armor); off: none (on by default: owner ruling 5, 2026-10-31, a book rule a GM may turn off)',
    `${HK(64)}, Sixth World Companion pp. 91–92`,
  ],
  magicAboveSixByGrade: [
    'On: Magic or Resonance at creation up to the highest plus the initiation or submersion grade; off: the highest alone (CRB Hong Kong p. 65)',
    `${OPTION}, ${HK(167)}`,
  ],
  availabilitySeven: ['On: gear of Availability 7 may be bought at creation; off: 6 at most (CRB Hong Kong p. 66)', HOUSE],
  cargoWithoutSeats: [
    'On: a vehicle’s seats removed add cargo space by the Cargo Factor formula (1.5 CF a seat, 1.25 on a bike)',
    `${OPTION}, Double Clutch p. 126`,
  ],
}
/** A setting's hover text (ABOUT; the per-metatype, per-magic-kind, sum-to-ten, point-buy and grade ones by their key). */
export function aboutOf(key: string): string {
  const grade = key.split(':'),
    part = { essence: 'Essence factor', cost: 'cost factor', avail: 'Availability modifier' }[grade[2] ?? '']
  const [what, where] =
    ABOUT[key] ??
    (key.startsWith('metatypeKarma:')
      ? ['Karma a runner pays to be this metatype (point buy, Karma build, lifepath)', SWC('28, 91')]
      : key.startsWith('pointBuy.startRating:')
        ? ['Point buy: the Magic or Resonance this kind starts at', SWC(29)]
        : key.startsWith('magicKarma:')
          ? [`Karma build: Karma to be this kind, taken from the Karma a runner starts with; ${NO_BOOK}`, KARMA_BUILD]
          : key.startsWith('lifepath.startRating:')
            ? ['Lifepath: the Magic or Resonance this kind starts at', SWC(32)]
            : key.startsWith('letterValue:')
              ? [`Sum to ten: what priority ${key.slice(12)} counts`, SWC(27)]
              : /^pointBuy\.(free|max)\./.test(key)
                ? [`Point buy: ${key.includes('.free.') ? 'the free' : 'the most'} ${key.endsWith('nuyen') ? 'nuyen' : `${key.split('.')[2]} points`}`, SWC(29)]
                : key.startsWith('grade:') && part
                  ? [`${cap(grade[1])} grade: its ${part}`, HK(282)]
                  : ['', ''])
  return what ? `${what} (${where}).` : ''
}
