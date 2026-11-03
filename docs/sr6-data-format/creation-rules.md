# Creation rules (Shadowrun 6 data format)

Part of the [Shadowrun 6 data format](../sr6-data-format.md).

The creation rules are the numbers the books print only in their text: starting karma, caps, exchange rates,
point-buy prices, lifepath counts, augmentation grades. A creation rules file (`<sr6:creation
xmlns:sr6="urn:chummer-sr6:config:1" version="1">`, `creation.xsd`) holds them as `<setting key value source? page?/>`
(500 at most, each key once).

**Layers.** A runner is built and checked with the server's settings (Table setup), or its campaign's own, with the
runner's own choices of the optional rules over them (its Creation method tab; `Sr6Character.rules`, `creation.ts
RUNNER_RULE_KEYS` and `runnerRules`): the prime runner's Karma, the expanded contacts, the Availability cap and its
illegal-only reading, the Karma and nuyen kept, an expertise's skill points, the quality count. A campaign's GM (or the
admin) can lock any of them on the campaign's page (`campaigns.xml <lock key by/>`): its runners then keep the table's
value, shown as locked with who locked it, and Review notes a choice set aside. Every place reads a runner's rules through
`runnerRules` (the editor, the budgets, Review, the sheets, career play, the Foundry export, which lists the rules that
aren't the server's in `rules`). A runner without its own choices has the table's, as before.

**The standard settings ship with the app**: `public/data/sr6/creation-defaults.xml` holds the core rulebook's numbers
as its latest printing prints them (source `CRB-HK`, the Hong Kong City Edition's pages; every value checked against
it) and the Sixth World Companion's for sum-to-ten, point buy and lifepath (source `SWC`), each with its
printed page; numbers only, no book text. A new server can build runners with every method a book prints right away.
The core rulebook's rules ship as the latest printing (the Hong Kong City Edition, source `CRB-HK`) prints them; the
books' optional rules ship off (`false`, with their book and page), for a table to turn on. The owner's house rules and
options (2026-10-11) ship off too, each a true/false toggle with the values a GM sets nested under it: no book prints
`karmaToNuyenMax` (under `karmaToNuyenCap`), `advance.powerPoint` (under `buyPowerPoints`), `positiveQualityFactor`
(under `positiveQualityMultiplier`) or the carry-over, data structure and grade caps. The **Karma build** is an option
that ships off too (`karmaBuildMethod`): no SR6 book prints one, so its numbers (`karmaBuild.*`, `magicKarma:*`,
`swcStreet.karmaBuild`, `swcElite.karmaBuild`) ship set to Commlink6's defaults (owner's one-off exception to "Commlink6
is never a data source", 2026-10-11), with no book and page and `option (Commlink6 defaults)` as the source in their hover
text; the Karma build's other prices are the `Karma prices` and nuyen rates (same numbers). `skillPointsExpertise` ships on (1: as a specialization's one rank; CRB Hong Kong p. 65 says
no expertise with skill points at creation while p. 68 prices one, so its hover text names both). `metatypeKarma:` is set to 0 for the core rulebook's five metatypes and to the Companion's karma for the 25
metavariants and metasapients its import writes (`swc.<id>`); a metatype from another book needs its own.

`custom/sr6/creation.xml` holds only what the admin changed (`PUT /api/sr6/creation`, on the Table setup page, `#/sr6/table`):
the server's settings are the standard ones with those keys replaced (`loadCreation` in `src/sr6/table-setup/domain/creation.ts`).
The Table setup page (and a campaign's own settings, a runner's Creation rules panel) lays the settings out in nine foldable
sections (Budgets & priorities; Attributes & skills; Qualities; Magic & Resonance; Gear & augmentations; Contacts & lifestyle;
Levels of play; Optional rules (book); House rules; `src/sr6/table-setup/ui/creationLayout.ts`), a closed section drawing no rows, with a
search box by name. Every on/off rule is a switch; a number that needs one sits indented under it, greyed with "needs …"
while it is off. A value at the standard is grey; a changed one stands out and shows the standard and its page beside it, with
**Reset** per value, **Reset section** and **Reset all to standard**; saving sends only the values that differ from the standard. An empty field means
the standard value. An older full `creation.xml` works the same (rows equal to the standard simply match it). **Load
settings file** fills the form from a creation rules file, the standard values filling the rest. A GM may give a
campaign they run its own copy on its page; it is kept in `custom/sr6/campaigns.xml` as the campaign's `<creation>` with the
same `<setting/>` rows (`campaigns.xsd`, `PUT /api/sr6/campaigns/<id> { creation }`, its GMs and the admin; its players
read it), and that campaign's runners are built, checked and priced with it. A campaign's own settings are a full copy,
started from the server's settings. Keys, types and
the methods that need them: `CREATION_KEYS` and `expandKeys` in `src/sr6/table-setup/domain/creation.ts` (per metatype:
`metatypeKarma:<id>`; per awakened or emerged magic kind: `pointBuy.startRating:<kind>`, `magicKarma:<kind>`,
`lifepath.startRating:<kind>`). A creation method whose settings are unset can't be picked.

**Rule presets.** The Table setup page's *Rule preset* menu puts a group of toggles in the form for review (`RULE_PRESETS`, `presetChanges` in `creation.ts`; Save keeps them): **Standard** returns the settings the presets manage to the standard values (the maths is the shipped standard), **Standard (Seattle)** sets `meleeArStrength` (Strength adds to a melee weapon's Attack Rating), **Shadowrun Missions** sets `availabilitySeven`, `gradeCapAtCreation` with `gradeCap.initiation` 1, `gradeCap.submersion` 2 and `gradeCap.transhuman` 1, `transhumanism`, `expandedSpecializations`, and `restrictMethods` allowing priority, sum-to-ten and point buy only, and **Configurable** changes nothing.

**Hover text.** Every setting's row on Table setup, and on a runner's Creation rules, has hover text (`aboutOf` in
`creation.ts`): what it does in plain words, then where a book prints it (book and page), else `house rule` or
`option`. No label or hover text names another app (`tests/sr6/table-setup/settings-about.test.ts`), except the Karma build option's
numbers, whose source reads `option (Commlink6 defaults)`.

Every key (Table setup sorts them into its nine sections, `src/sr6/table-setup/ui/creationLayout.ts`, not in this order). *Needed by*: the methods that can't be picked while it is unset (`all`:
every method); `optional`: unset, the rule that reads it is skipped (Advancement: the spend that needs it is refused,
a cap isn't applied, an exchange isn't offered; Derived values: the value shows empty; a grade: it can't be
chosen while its Essence factor is unset). `karmaToNuyenMax` isn't printed in the core rulebook (`maxKarmaLeft` is, from the
City Editions on: 5, Hong Kong p. 66, shipped):
unset, there is no limit (a table that uses one enters it from the book or house rule that gives it). A number may be a decimal; `true/false` is the word; a quality id names a catalog quality (`crb.<slug>`).

*Needs*, *not with* and *in place of* are the nested optional rules (`RULE_DEPS` in `creation.ts`; the books' pages in
the owner's notes): a setting that needs another applies only while that one is on (a true/false one `true`, any other
set); while it is off the setting keeps its stored value but is left out (`applyDeps`, inside `runnerRules`, so the
engine never sees it), and Table setup and a runner's Creation rules show it under its parent, greyed and disabled with
"needs …". Two settings *not with* each other can't both be on: the second is disabled there and says why; rules that
come on together anyway (a hand-edited file, the table's and a runner's own) keep one, the campaign-locked one, else the
runner's own, else the one listed first, and Review notes a runner's choice set aside (`rules.setAside`). *In place of*:
the settings a rule stands in for while on (its own code does it). Every rule stays off by default.

| group | key | type | needed by | needs | not with | in place of | what it is |
|---|---|---|---|---|---|---|---|
| General | `startingKarma` | number | all |  |  |  | Starting karma |
| General | `qualityNetBonusCap` | number | all |  |  |  | Most net karma from qualities |
| General | `qualityMaxCount` | number | all |  |  |  | Most paid qualities |
| General | `oneAttributeAtMax` | true/false | all |  |  |  | Only one attribute at its maximum |
| General | `oneSkillAtMax` | true/false | optional |  |  |  | Only one skill at the highest rank (CRB Hong Kong p. 65) |
| General | `attributeBaseMax` | number | optional |  |  |  | Adjustment points go on attributes whose metatype maximum is above |
| General | `skillCap` | number | all |  |  |  | Highest skill rank |
| General | `skillCapAptitude` | number | all |  |  |  | Highest skill rank with the aptitude quality |
| General | `aptitudeQuality` | quality id | all |  |  |  | Aptitude quality: `skillCapAptitude` (and, in career, `advance.skillMax` + the same step) for the skill its note names only (CRB Hong Kong p. 70: "for the selected skill"); one naming no skill lets any one skill go higher, and Review's `quality.choice` asks for the skill |
| General | `skillPointsSpec` | number | all |  |  |  | Skill points for a specialization |
| General | `skillPointsExpertise` | number | optional |  |  |  | Skill points for an expertise (shipped 1; unset: bought with karma at `advance.expertise`). A book discrepancy: CRB Hong Kong p. 65 (none with skill points at creation) against p. 68 (its price) |
| General | `magicMax` | number | all |  |  |  | Highest Magic or Resonance |
| General | `essence` | number | all |  |  |  | Starting Essence |
| General | `contactPointsPerCha` | number | all |  |  |  | Contact points per Charisma (the augmented Charisma, as Logic's knowledge skills the augmented Logic: owner, 2026-10-09) |
| General | `knowledgePerLog` | number | all |  |  |  | Free knowledge skills per Logic |
| General | `maxAvailability` | number | all |  |  |  | Highest Availability |
| General | `karmaSpellsAtCreation` | true/false | optional |  |  |  | On: spells, rituals and complex forms past the free ones can be bought with the customization Karma (the core rulebook's 2019 printing p. 68); off: they can't, as the later printings say |
| General | `maxNuyenLeft` | number | all |  |  |  | Most nuyen kept after creation (CRB Hong Kong p. 68: 5,000); more is Review's `leftover.nuyen`, an error a GM can approve |
| General | `freeSpellsPerMagic` | number | all |  |  |  | Free spells per Magic |
| General | `freeFormsPerResonance` | number | all |  |  |  | Free complex forms per Resonance |
| General | `maxKarmaLeft` | number | optional |  |  |  | Most karma kept after creation (CRB Hong Kong p. 66: 5; more is `leftover.karma`, an error a GM can approve; unset: no limit) |
| General | `ownCarryOver` | true/false | optional |  |  | `maxKarmaLeft`, `maxNuyenLeft` | House rule, off: the GM's own carry-over limits `carryOver.karma` and `carryOver.nuyen` (nested, unset) replace the book's while on |
| General | `carryOver.karma`, `carryOver.nuyen` | number | optional | `ownCarryOver` |  |  | The GM's own most Karma and nuyen kept after creation |
| General | `mentorSpiritQuality` | quality id | optional |  |  |  | The Mentor Spirit quality (CRB Hong Kong p. 73): choosing a mentor spirit on the Magic tab adds it with its Karma; removing it removes the mentor spirit |
| General | `expandedContacts` | true/false | optional |  |  |  | The Sixth World Companion's Expanded Rules for Contacts at Character Creation (SWC p. 161), optional: off (each rating up to Charisma, no karma). The importer assumes it for a book sample whose printed contacts need it |
| General | `contactKarma` | number | optional | `expandedContacts` |  |  | With `expandedContacts`: karma per contact point past the points or past a contact's pair cap (SWC p. 161: 1) |
| General | `contactPairPerCha` | number | optional | `expandedContacts` |  |  | A contact's connection + loyalty up to Charisma times (with `contactKarma`) |
| General | `contactRatingMax` | number | optional | `expandedContacts` |  |  | Highest contact rating (with `contactKarma`; unset: Charisma) |
| General | `manyTalentsQuality` | quality id | optional |  |  |  | Many Talents: two attributes at their maximum (SWC p. 134) |
| General | `manySkillsQuality` | quality id | optional |  |  |  | Many Skills: two skills at the highest rank (SWC p. 134) |
| General | `availabilityCapIllegalOnly` | bool | optional |  |  |  | The Availability cap holds only illegal gear (the 2019 printing's p. 66; the later printings cap every item, so it ships `false`, CRB Hong Kong p. 66) |
| General | `exceptionalQuality` | quality id | optional |  |  |  | Exceptional (Attribute): +1 to the maximum of the attribute its note names (CRB Hong Kong p. 71), once per attribute (Review's `quality.choiceTwice`). When the quality carries its own `attr-max:choice` effect, that effect is what counts (never twice) |
| General | `incompetentQuality` | quality id | optional |  |  |  | Incompetent (Skill) (CRB Hong Kong pp. 76–77): no ranks in the skill its note names, not a Magic skill without Magic nor Tasking without Resonance (`skill.incompetent`), that skill once (`quality.choiceTwice`) |
| General | `sensitiveSystemQuality` | quality id | optional |  |  |  | Sensitive System (CRB Hong Kong p. 78): an error with a Magic or Resonance rating (`quality.sensitiveSystem`); cyberware, bioware and nanoware Essence times `sensitiveSystemEssence` (2) |
| General | `sensitiveSystemEssence` | number | optional |  |  |  | Sensitive System's Essence factor (CRB Hong Kong p. 78: doubled) |
| General | `languageMax` | number | optional |  |  |  | Highest level any language reaches (owner, 2026-10-11: 4; the Native one counts as this level, the stepper and the Foundry export use it); one Native language only (CRB Hong Kong p. 67): Review's `knowledge.languages` (unset: no cap) |
| General | `fociForcePerMagic` | number | optional |  |  |  | The foci's Force together at most Magic times this (CRB Hong Kong p. 154: 5); with no more foci than Magic and none of Force above it, and none for a runner neither awakened (`magic.foci`) |
| General | `fociBondKarma` | true/false | optional |  |  |  | A focus costs its bonding Karma (its catalog `karma`, `Force x 3`, at the line's rating) out of the customization Karma (CRB Hong Kong pp. 154, 168: a focus is used only once bonded; true) |
| General | `improvedAbilityPower` | quality id | optional |  |  |  | The Improved Ability adept power (an adept power's id; CRB Hong Kong p. 157): it needs a rank in the skill its note names, and the boosted skill is at most `improvedAbilityFactor` times the rank, rounded up, or the rank + `skillAugmentMax`, whichever is lower (`adept.improvedAbility`) |
| General | `improvedAbilityFactor` | number | optional |  |  |  | Improved Ability's most: 1.5 times the original rank (CRB Hong Kong p. 157) |
| General | `attributeMaxFloor` | number | optional |  |  |  | The lowest a quality's effect lowers an attribute's maximum to (Impaired: "to a minimum of 2", CRB Hong Kong p. 76; unset: no floor) |
| Levels of play | `priorityLetters` | letters | optional |  |  |  | The five priority letters the columns take, one each (CRB Hong Kong p. 63: `ABCDE`); sum to ten takes only letters among them. A level of play sets its own |
| Levels of play | `levelStreet` | true/false | optional |  | `levelPrime`, `levelSwcStreet`, `levelSwcElite` |  | Street level (CRB Hong Kong p. 63, off): each priority gives the values of the row below (E stays E): points, nuyen, metatypes and magic kinds |
| Levels of play | `levelPrime` | true/false | optional |  | `levelStreet`, `levelSwcStreet`, `levelSwcElite` |  | Prime runner (CRB Hong Kong p. 63, off): twice `startingKarma` |
| Levels of play | `levelSwcStreet` | true/false | optional |  | `levelStreet`, `levelPrime`, `levelSwcElite` | `sumToTenTarget`, `pointBuy.total`, `lifepath.moduleCount`, `priorityLetters` | The Sixth World Companion's street-level (SWC pp. 14–15, off): while on, `swcStreet.letters` (B C C D E), `.sumToTen` (8), `.pointBuy` (80) and `.modules` (6) replace `priorityLetters`, `sumToTenTarget`, `pointBuy.total` and `lifepath.moduleCount` (`levelRules`, through `runnerRules`), and an illegal item but a cyberdeck is an error (`gear.illegal`) |
| Levels of play | `levelSwcElite` | true/false | optional |  | `levelStreet`, `levelPrime`, `levelSwcStreet` | `sumToTenTarget`, `pointBuy.total`, `lifepath.moduleCount`, `priorityLetters`, `maxAvailability` | The Sixth World Companion's elite (SWC p. 15, off): `swcElite.letters` (A B B C D), `.sumToTen` (12), `.pointBuy` (120), `.modules` (10) likewise, and no Availability cap. The book's letters add up to 13 while it says sum-to-twelve: both ship as printed |
| Levels of play | `swcStreet.*`, `swcElite.*` | number, letters | optional | `levelSwcStreet`, `levelSwcElite` |  |  | The two levels' own values (above) |
| Levels of play | `swcStreet.karmaBuild`, `swcElite.karmaBuild` | number | optional | `levelSwcStreet`, `levelSwcElite`, `karmaBuildMethod` |  | `karmaBuild.start` | The Karma build's starting karma at the level (800 and 1200; option, Commlink6 defaults); the standard level's is `karmaBuild.start` |
| Karma prices | `karmaAttrPerRank` | number | all |  |  |  | Attribute: karma per rank, times the new rating |
| Karma prices | `karmaSkillPerRank` | number | all |  |  |  | Skill: karma per rank, times the new rank |
| Karma prices | `karmaSpec` | number | all |  |  |  | Specialization |
| Karma prices | `karmaKnowledge` | number | all |  |  |  | Knowledge or language rank |
| Karma prices | `karmaSpell` | number | all |  |  |  | Extra spell or ritual |
| Karma prices | `karmaForm` | number | all |  |  |  | Extra complex form |
| Karma prices | `karmaInitiationBase` | number | all |  |  |  | Initiation or submersion: base |
| Karma prices | `karmaInitiationPerGrade` | number | all |  |  |  | Initiation or submersion: per grade |
| Karma prices | `positiveQualityMultiplier` | true/false | optional |  |  |  | Option, off: positive qualities cost their karma times `positiveQualityFactor` |
| Karma prices | `positiveQualityFactor` | number | optional | `positiveQualityMultiplier` |  |  | Positive qualities cost their karma times (shipped 1; unset or the option off: 1) |
| Karma prices | `karmaMartialArt` | number | optional |  |  |  | Martial arts style (it comes with its signature technique; unset: counts 0, Review warns, not bought after creation) |
| Karma prices | `karmaTechnique` | number | optional |  |  |  | Martial arts technique (a style’s signature one is free; unset: as `karmaMartialArt`) |
| Advancement | `advance.expertise` | number | optional |  |  |  | Expertise after creation |
| Advancement | `advance.expertiseRank` | number | optional |  |  |  | Lowest skill rank for an expertise (unset: none; Review's `skill.expertiseRank`) |
| Advancement | `advance.qualityFactor` | number | optional |  |  |  | A positive quality after creation costs its karma times |
| Advancement | `advance.buyOffFactor` | number | optional |  |  |  | Buying off a negative quality costs its karma times |
| Advancement | `advance.skillMax` | number | optional |  |  |  | Highest skill rank after creation (unset: no cap) |
| Advancement | `buyPowerPoints` | true/false | optional |  |  |  | House rule, off: a mystic adept buys power points after creation for `advance.powerPoint` (the book: a power point in place of a metamagic at initiation, CRB Hong Kong p. 168) |
| Advancement | `advance.powerPoint` | number | optional | `buyPowerPoints` |  |  | Karma per power point (mystic adepts; unset) |
| Advancement | `advance.karmaToNuyenRate` | number | optional | `workingForTheMan` |  |  | Nuyen per karma after creation, with `workingForTheMan` on (the Sixth World Companion's Working for the Man, p. 153: 2,000) |
| Advancement | `advance.nuyenToKarmaRate` | number | optional | `workingForThePeople` |  |  | Nuyen per karma, nuyen to karma, with `workingForThePeople` on (Working for the People, SWC p. 153: 2,000) |
| Nuyen | `karmaToNuyenRate` | number | all |  |  |  | Nuyen per karma |
| Nuyen | `karmaToNuyenRateInDebt` | number | all |  |  |  | Nuyen per karma with the in-debt quality |
| Nuyen | `inDebtQuality` | quality id | all |  |  |  | In-debt quality |
| Nuyen | `stolenGearQuality` | quality id | optional |  |  |  | No Future's Stolen Gear (`nf.stolen-gear`), as its errata has it (NF p. 162): 0 Karma; with it the Karma turned into nuyen at creation is `karmaToNuyenRateStolenGear` a Karma, at most `karmaToNuyenMaxStolenGear` at any rate; never with In Debt (Review's `quality.stolenGearInDebt`); after creation bought off a part at a time, `stolenGearBuyOff` Karma per converted Karma (docs/sr6-character-format.md, `buyoff` `part`) |
| Nuyen | `karmaToNuyenRateStolenGear` | number | optional |  |  |  | Nuyen per karma with Stolen Gear (10,000) |
| Nuyen | `karmaToNuyenMaxStolenGear` | number | optional |  |  |  | Most karma turned into nuyen with Stolen Gear (20; `karmaToNuyenMax` too when lower): refused at creation; after it, the karma converted at creation and since past it is a career Review warning (`quality.stolenGearCap`), never refused |
| Nuyen | `stolenGearBuyOff` | number | optional |  |  |  | Karma to buy off one Karma of Stolen Gear's conversion (2) |
| Nuyen | `karmaToNuyenCap` | true/false | optional |  |  |  | House rule, off (no limit: CRB Hong Kong p. 66 prints none): the Karma turned into nuyen at creation up to `karmaToNuyenMax` |
| Nuyen | `karmaToNuyenMax` | number | optional | `karmaToNuyenCap` |  |  | Most karma turned into nuyen (unset: no limit) |
| Nuyen | `dataStructureNuyen` | number | optional |  |  |  | Nuyen per level of a data structure bought (Hack & Slash p. 72: 5,000); its Karma, the level, is paid to integrate it (p. 71) |
| Nuyen | `fakeSinPerRating` | number | all |  |  |  | Fake SIN: nuyen per rating |
| Nuyen | `licencePerRating` | number | all |  |  |  | Fake licence: nuyen per rating |
| Sum to ten | `sumToTenTarget` | number | sum to ten |  |  |  | The letters’ values add up to at most |
| Sum to ten | `letterValue:A` | number | sum to ten |  |  |  | Value of priority A |
| Sum to ten | `letterValue:B` | number | sum to ten |  |  |  | Value of priority B |
| Sum to ten | `letterValue:C` | number | sum to ten |  |  |  | Value of priority C |
| Sum to ten | `letterValue:D` | number | sum to ten |  |  |  | Value of priority D |
| Sum to ten | `letterValue:E` | number | sum to ten |  |  |  | Value of priority E |
| Point buy | `pointBuy.total` | number | point buy |  |  |  | Character points |
| Point buy | `pointBuy.awakened` | number | point buy |  |  |  | Character points to be awakened or emerged |
| Point buy | `pointBuy.free.attribute` | number | point buy |  |  |  | Free attribute points |
| Point buy | `pointBuy.max.attribute` | number | point buy |  |  |  | Most attribute points |
| Point buy | `pointBuy.free.skill` | number | point buy |  |  |  | Free skill points |
| Point buy | `pointBuy.max.skill` | number | point buy |  |  |  | Most skill points |
| Point buy | `pointBuy.free.adjustment` | number | point buy |  |  |  | Free adjustment points |
| Point buy | `pointBuy.max.adjustment` | number | point buy |  |  |  | Most adjustment points |
| Point buy | `pointBuy.free.nuyen` | number | point buy |  |  |  | Free nuyen |
| Point buy | `pointBuy.max.nuyen` | number | point buy |  |  |  | Most nuyen |
| Point buy | `pointBuy.cost.attribute` | number | point buy |  |  |  | Character points per attribute point |
| Point buy | `pointBuy.cost.skill` | number | point buy |  |  |  | Character points per skill point |
| Point buy | `pointBuy.cost.adjustment` | number | point buy |  |  |  | Character points per adjustment point |
| Point buy | `pointBuy.cost.powerPoint` | number | point buy |  |  |  | Character points per power point |
| Point buy | `pointBuy.cost.mysticPowerPoint` | number | point buy |  |  |  | Character points per power point (mystic adept) |
| Point buy | `pointBuy.cost.spell` | number | point buy |  |  |  | Character points per spell |
| Point buy | `pointBuy.cost.complexForm` | number | point buy |  |  |  | Character points per complex form |
| Point buy | `pointBuy.nuyenPerCp` | number | point buy |  |  |  | Nuyen per character point |
| Point buy | `pointBuy.oneSpecialization` | true/false | point buy |  |  |  | Only one specialization |
| Karma build | `karmaBuildMethod` | true/false | optional |  |  |  | Option, off: the Karma build can be picked (no SR6 book prints one); its numbers ship as Commlink6's defaults |
| Karma build | `karmaBuild.start` | number | karma | `karmaBuildMethod` |  |  | Starting karma (karma build): 1000 |
| Karma build | `karmaBuild.startRating` | number | karma | `karmaBuildMethod` |  |  | Starting Magic or Resonance (karma build): 1 |
| Karma build | `karmaBuild.freeSpellsPerMagic` | number | karma | `karmaBuildMethod` |  |  | Free spells and rituals per Magic (karma build): 0, every one costs `karmaSpell`. The other methods use `freeSpellsPerMagic` |
| Karma build | `karmaBuild.freeFormsPerResonance` | number | karma | `karmaBuildMethod` |  |  | Free complex forms per Resonance (karma build): 0, every one costs `karmaForm`. The other methods use `freeFormsPerResonance` |
| Lifepath | `lifepath.moduleCount` | number | lifepath |  |  |  | Adult life modules to take |
| Lifepath | `lifepath.contactRatingCap` | number | lifepath |  |  |  | Highest contact rating |
| Lifepath | `lifepath.bestAttributeBonus` | number | optional |  |  |  | The best attribute rises by this, up to its metatype maximum; the rest goes on a second attribute (unset: no raise) |
| Lifepath | `lifepath.repeatModules` | number | optional |  |  |  | Adult modules that may be taken twice (unset: none) |
| Lifepath | `lifepath.contactKarma` | number | optional |  |  |  | Karma per contact rating the contact points don't cover (each module's points go only to contacts of its types; unset: not offered, the ratings overspend the points). Karma never raises a contact's connection or loyalty above Charisma: the points must pay for what is above it (SWC p. 31) |
| Lifepath | `lifepath.raisedAttributeStart` | number | optional |  |  |  | Attributes whose metatype maximum is above `attributeBaseMax` start at (Born This Way; unset: 1) |
| Lifepath | `lifepath.mundaneEdge` | number | optional |  |  |  | Edge a runner neither awakened nor emerged gains (Born This Way; unset: none) |
| Augmentation grades | `grade:standard:essence` | number | optional |  |  |  | Standard: Essence times |
| Augmentation grades | `grade:standard:cost` | number | optional |  |  |  | Standard: cost times |
| Augmentation grades | `grade:standard:avail` | number | optional |  |  |  | Standard: Availability plus |
| Augmentation grades | `grade:alpha:essence` | number | optional |  |  |  | Alpha: Essence times |
| Augmentation grades | `grade:alpha:cost` | number | optional |  |  |  | Alpha: cost times |
| Augmentation grades | `grade:alpha:avail` | number | optional |  |  |  | Alpha: Availability plus |
| Augmentation grades | `grade:beta:essence` | number | optional |  |  |  | Beta: Essence times |
| Augmentation grades | `grade:beta:cost` | number | optional |  |  |  | Beta: cost times |
| Augmentation grades | `grade:beta:avail` | number | optional |  |  |  | Beta: Availability plus |
| Augmentation grades | `grade:delta:essence` | number | optional |  |  |  | Delta: Essence times |
| Augmentation grades | `grade:delta:cost` | number | optional |  |  |  | Delta: cost times |
| Augmentation grades | `grade:delta:avail` | number | optional |  |  |  | Delta: Availability plus |
| Augmentation grades | `grade:used:essence` | number | optional |  |  |  | Used: Essence times |
| Augmentation grades | `grade:used:cost` | number | optional |  |  |  | Used: cost times |
| Augmentation grades | `grade:used:avail` | number | optional |  |  |  | Used: Availability plus |
| Derived values | `monitorBase` | number | optional |  |  |  | Condition monitor: boxes before the attribute |
| Derived values | `monitorDivisor` | number | optional |  |  |  | Condition monitor: the attribute divided by (rounded up) |
| Derived values | `initiativeDice` | number | optional |  |  |  | Initiative dice |
| Derived values | `initiativeDiceMax` | number | optional |  |  |  | Most initiative dice, after bonuses, astral and Matrix too (CRB Hong Kong p. 39: 5; unset: no cap) |
| Derived values | `astralInitiativeDice` | number | optional |  |  |  | Astral initiative dice |
| Derived values | `specDice` | number | optional |  |  |  | Dice for a specialization |
| Derived values | `expertiseDice` | number | optional |  |  |  | Dice for an expertise |
| Derived values | `untrainedPenalty` | number | optional |  |  |  | Dice off the attribute for an untrained skill |
| Derived values | `overflowPerBody` | number | optional |  |  |  | Damage Overflow boxes per point of Body (CRB Hong Kong p. 121: dead at Body × 2; 2), plus what adds to them (Will to Live); unset: Body counts none |
| Derived values | `attributeAugmentMax` | number | optional |  |  |  | Most an attribute's augmented value is above its natural one (CRB Hong Kong p. 37: 4); the always-on and the bracketed totals alike, a penalty never; the attribute card and Review say what was left out (unset: no cap) |
| Derived values | `skillAugmentMax` | number | optional |  |  |  | Most a skill's dice pool is raised by bonuses, a specialization's bonus within it (CRB Hong Kong p. 39: 4; unset: no cap) |
| Derived values | `monitorMinimum` | number | optional |  |  |  | Fewest boxes a condition monitor is lowered to (Glass Jaw, CRB Hong Kong p. 76: 2; unset: no floor) |
| Derived values | `matrixColdDice`, `matrixHotDice` | number | optional |  |  |  | VR initiative dice on top of the usual `initiativeDice` (CRB Hong Kong p. 179: 1 cold sim, 2 hot sim, within the 5D6); with what adds Matrix initiative dice. Matrix initiative is shown when the runner has a commlink (its D/F array's Data Processing) or is a technomancer (Logic, p. 189); AR initiative is the physical one |
| Derived values | `moveWalk`, `moveSprint`, `moveSprintPerHit` | number | optional |  |  |  | Metres for a Move (CRB Hong Kong p. 42: 10), a Sprint (p. 44: 15) and a Sprint's metres more a hit (1), plus what adds to movement |
| Derived values | `unarmedDV` | number | optional |  |  |  | Unarmed Damage Value (CRB Hong Kong p. 94: 2S). Physical with the `dermalDepositsQuality` (p. 71) or an effect `derived:unarmed-damage` (bone lacing, bone density: pp. 286, 291); an effect `derived:unarmed-dv` `set` (the bone lacing table's `3P`) raises it to that value, `add` adds (unset: none shown) |
| Derived values | `arDrEdgeGap` | number | optional |  |  |  | The lead of an Attack Rating over a Defense Rating, or the other way, that gains a point of Edge (CRB Hong Kong p. 45: 4): the Gear tab's target Defense Rating shows it at each range band |
| Derived values | `meleeArStrength` | true/false | optional |  |  |  | Strength adds to a melee weapon's Attack Rating (CRB Hong Kong p. 39: true; a whip, whose AR note says so, Reaction: p. 250). A melee weapon: an Attack Rating at Close only, no modes or ammo |
| Optional rules | `stackingAdvantage` | true/false | optional | `arDrEdgeGap` |  |  | The Sixth World Companion's Stacking Advantage (SWC p. 144, off): a lead of twice `arDrEdgeGap` gains 2 Edge, never more |
| Optional rules | `strengthInCloseCombat` | true/false | optional |  |  | `meleeArStrength` | Rolling Strength instead of Agility in Close Combat (SWC p. 150, off): Close Combat's pool uses Strength, and Agility goes into the melee and unarmed Attack Ratings in Strength's place |
| Optional rules | `highStrengthDamage` | true/false | optional |  |  |  | High Strength Adds to Damage (SWC p. 150, off): +1 to the unarmed and melee Damage Values from Strength `strengthDamageStep1` (7), +2 from `strengthDamageStep2` (10) |
| Optional rules | `alternateMysticAdept` | true/false | optional |  |  |  | Alternate Mystic Adept (SWC p. 148, off): half a power point for each point of Magic given to powers and for each point of Magic raised past the priority's, at creation and after; Conjuring and Enchanting are errors |
| Optional rules | `twentyQuestions`, `twentyQuestionsKarma` | true/false, number | optional |  |  |  | Twenty Questions (SWC p. 25, off): the karma (3) added to the starting karma |
| Optional rules | `workingForTheMan`, `workingForThePeople` | true/false | optional |  |  |  | Working for the Man / for the People (SWC p. 153, off): karma to nuyen, nuyen to karma after creation, at the Advancement rates |
| Optional rules | `expandedSpecializations` | true/false | optional |  |  |  | Expanded Specializations (SWC p. 153, off): any number of specializations a skill (`<skill specs>`), still one expertise; off, only Exotic Weapons takes several (CRB Hong Kong p. 95), and Review's `skill.oneSpec` flags the others |
| Optional rules | `unrestrictedSkillRanks` | true/false | optional |  |  | `advance.skillMax` | Unrestricted Skill Ranks (SWC p. 153, off): no `advance.skillMax` after creation |
| Optional rules | `suprathyroidStacks` | true/false | optional |  |  |  | Suprathyroid Bonuses Stack (SWC p. 149, off): the suprathyroid gland is exempt from the other augmentations' attribute and initiative incompatibilities (`gear.incompatible`); the +4 cap still holds |
| Optional rules | `infectedAllowed` | true/false | optional |  |  |  | Infected Player Characters Allowed (SWC p. 104, off): the Infected qualities and optional powers (classes `INFECTED`, `INFECTED/OPTIONAL_POWER`) are offered in the pickers and may be taken at creation and bought after, at their own Karma; off, they are hidden and refused |
| Optional rules | `infectedPowersAtCreation` | true/false | optional | `infectedAllowed` |  |  | Infected Optional Powers at Creation (GM override, off; SWC p. 105: "in general" bought after creation): an Infected runner buys its type's optional powers at creation; off, only its one free pick at creation |
| Optional rules | `strengthDamageStep1`, `strengthDamageStep2` | number | optional | `highStrengthDamage` |  |  | The Strength for each step of High Strength Adds to Damage (SWC p. 150: 7 and 10) |
| Optional rules | `exoticFirstSpecFree` | true/false | optional |  |  |  | House rule, off: the first Exotic Weapons specialization costs no skill points or Karma |
| Optional rules | `mentorBothAdvantages` | true/false | optional |  |  |  | House rule, off: a mystic adept gets both its mentor spirit's magician and adept advantages; off, it picks one for good (CRB Hong Kong pp. 162–163; Review's `magic.mentorAdvantage` until picked) |
| Optional rules | `dataStructureCaps` | true/false | optional |  |  |  | House rule, off: a technomancer's data structures past `dataStructure.maxCount` or above `dataStructure.maxRating` are Review's `magic.dataStructureCaps`, errors a GM can approve |
| Optional rules | `dataStructure.maxCount`, `dataStructure.maxRating` | number | optional | `dataStructureCaps` |  |  | The GM's caps (unset) |
| Optional rules | `noUsedCulturedBioware` | true/false | optional |  |  |  | House rule, off: cultured bioware takes no used grade (nor Body Shop's omega, which replaces it); the books print no exclusion (CRB Hong Kong p. 282) |
| Optional rules | `gradeCapAtCreation` | true/false | optional |  |  |  | House rule, off: an initiation or submersion grade at creation above `gradeCap.initiation` or `gradeCap.submersion` is Review's `magic.gradeCapCreation`, an error a GM can approve (a grade above Magic or Resonance stays `magic.gradeCap`) |
| Optional rules | `gradeCap.initiation`, `gradeCap.submersion`, `gradeCap.transhuman` | number | optional | `gradeCapAtCreation` |  |  | The GM's caps (unset) |
| Optional rules | `transhumanism` | true/false | optional |  |  |  | Option, off (Sixth World Companion p. 146): a mundane runner buys transhumanist grades (`transhuman` on the build; 20 at most) for the initiation price, 10 + the next grade in Karma, and each makes an Essence hole of 1.0 that augmentations' Essence is paid from first (`essenceBudget`); Review's `magic.transhuman` flags a grade with the rule off or for an awakened or emerged runner, `magic.gradeCapCreation` the cap |
| General | `restrictMethods` | true/false | optional |  |  |  | House rule, off: with it on, a runner can only be built with the creation methods ticked under it (`missingFor` lists `restrictMethods` for another; Game data says "the table doesn’t allow it") |
| General | `methodAllowed.priority`, `.sumtoten`, `.pointbuy`, `.karma`, `.lifepath` | true/false | optional | `restrictMethods` |  |  | Whether that method may be picked while the limit is on (unset: not allowed) |
| Optional rules | `adjustOnLoweredMax` | true/false | optional |  |  |  | House rule, off: adjustment points also on an attribute whose metatype maximum is below `attributeBaseMax` |
| Optional rules | `pointBuyErrataNuyen` | true/false | optional |  |  | `pointBuy.max.nuyen` | House rule, off: point buy's most nuyen is 450,000, the errata version (as printed: 440,000, SWC p. 29) |
| Optional rules | `knowledgeLogicIntuition` | true/false | optional |  |  |  | House rule, off: free knowledge points from Logic + Intuition (as printed: Logic, CRB Hong Kong p. 67) |
| Optional rules | `magicAboveSixByGrade` | true/false | optional |  |  |  | Option, off (CRB Hong Kong p. 167): Magic or Resonance at creation up to `magicMax` plus the initiation or submersion grade (as printed: `magicMax`, p. 65) |
| Optional rules | `eliteSumToThirteen` | true/false | optional | `levelSwcElite` |  | `sumToTenTarget` | House rule, off: with Elite, sum-to-thirteen (the book prints sum-to-twelve) |
| Optional rules | `availabilitySeven` | true/false | optional |  |  | `maxAvailability` | House rule, off: gear of Availability 7 at creation (as printed: 6, CRB Hong Kong p. 66) |
| Optional rules | `cargoWithoutSeats` | true/false | optional |  |  |  | Option, off (Double Clutch p. 126): a vehicle line's seats removed (`<purchase seatsRemoved>`) add cargo; its Cargo Factor 150 percent of Seating (125 on a bike), 4 more on a truck, shown on the Vehicles tab |
| Optional rules | `metatypeSizePricing` | true/false | optional |  |  |  | House rule, on: a troll-sized runner (troll, cyclops, fomori, giant, minotaur: budgets.ts `metatypeSize`, by the metatype's name) pays 10% more for everything bought, a dwarf-sized one (dwarf, gnome, hanuman, koborokuru, menehune) 10% more for armor, as one `sizePricing` line of the nuyen budget (no SR6 book prints a general rule). The importer fits a book sample's priorities with it as shipped (fit.py `metatype_size`, the same words) |
| Derived values | `charismaticDefenseQuality` | quality id | optional |  |  |  | Charismatic Defense: the Defense Rating from Charisma, not Body (Power Plays p. 85) |
| Metatypes | `metatypeKarma:<metatype id>` | number | point buy, karma, lifepath |  |  |  | the metatype's karma (one per catalog metatype) |
| Point buy | `pointBuy.startRating:<kind>` | number | point buy |  |  |  | starting Magic or Resonance per awakened or emerged kind |
| Karma build | `magicKarma:<kind>` | number | karma | `karmaBuildMethod` |  |  | karma to be that kind (full magician 60, aspected 45, mystic adept 75, adept 45, technomancer 45) |
| Lifepath | `lifepath.startRating:<kind>` | number | lifepath |  |  |  | starting Magic or Resonance per kind |

The kinds are `full`, `aspected`, `mystic-adept`, `adept` and `technomancer`. An unknown key, or a value that isn't of
its key's type, is listed as an error on Game data and skipped.
