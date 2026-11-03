# SR6 optional and house rules: audit (2026-11-02)

## Bottom line

The SR6 creation settings hold **210 settings**. Most of them (114) are the core rulebook's own numbers and switches.
Of the rest, **44 are optional rules a book actually prints**, **38 are true house rules** (no book prints them) and
**14 are not game rules at all**: they are app conveniences.

Before this change some book rules sat under "House rules" and the other way round, because the app sorted a switch by
the words at the end of its hover text. It now uses one explicit list (`RULE_META` in
`src/sr6/table-setup/ui/creationLayout.ts`), so each rule sits in the section that matches what it really is:

- **Optional rules (book)**: each row shows a plain-English line and the book and page.
- **House rules**: each row shows a plain-English line.
- **App conveniences** (new): the optional data set switch, and the "which catalog quality does this rule look for"
  pickers.

Inside these three sections the rows are sorted A to Z. A rule's sub-settings still sit right under it.

**Nothing about the stored settings changed.** Every setting keeps its id, its default, its XML shape and what it does
in play. A saved `custom/sr6/creation.xml` loads exactly as before, and a test proves the round trip
(`tests/sr6/table-setup/sr6-creation-layout.test.ts`).

## How each setting was classified

- **Core rule toggle / Core rule value**: the core rulebook's (or a creation method's) own rule. The page comes from the
  shipped defaults file `public/data/sr6/creation-defaults.xml` (its `source`/`page` attributes) or from the setting's
  hover text in `src/sr6/table-setup/domain/creation.ts` (`ABOUT`).
- **Optional book rule**: a book prints it as optional, or it comes from a printing the latest one replaced. The book and
  page come from the same two places. CRB Hong Kong is the latest core rulebook printing, and its pages win.
- **True house rule**: the hover text says "house rule", or "option" with no book page. No book prints it.
- **Tool convenience**: it tells the app what to load or which catalog item to look for. It is not a rule of play.
- A sub-setting (a number that only counts while its switch is on) takes its switch's class.
- **(needs owner)**: I couldn't prove the class from the repo. See the list below.

I quote no book text: page numbers only.

## Needs owner (plain English)

1. **RULED 2026-11-03 (owner): book rule, no extra Essence; switch removed.** ~~**Capacity accessory Essence** (`capacityAccessoryEssence`): the rulebook tables (CRB pp. 285–286) print an add-on's
   own Essence, but the books' sample characters leave it out. Is charging it a book rule or your house rule? It is
   filed under House rules for now.
2. **Point buy 450,000 nuyen** (`pointBuyErrataNuyen`): the app calls it "the errata version". If an official errata
   says 450,000, it is a book rule, not a house rule. Which errata is it?
3. **(Logic + Intuition) × 2 knowledge points** (`knowledgeLogicIntuition`): cited as CRB p. 98 with no printing named.
   Is it still in the Hong Kong printing?
4. **Metatype size pricing** (`metatypeSizePricing`): you ruled it a book rule on 2026-10-31. The "CRB p. 64" page has no
   printing named, so the page needs checking against the Hong Kong printing.
5. **Availability cap on illegal gear only** (`availabilityCapIllegalOnly`) and 6. **Extra spells with creation Karma**
   (`karmaSpellsAtCreation`): both are the 2019 printing's wording, which later printings changed. Are they optional
   book rules (filed that way now), or house rules today?
7. **Karma build** (`karmaBuildMethod`, with its numbers): the app calls it an "option", but no SR6 book prints a Karma
   build, so it is filed as a house rule.
8. **Positive quality multiplier** (`positiveQualityMultiplier`): also called an "option" with no book page, so it is
   filed as a house rule.
9. **Optional data set** (`cl6OnlyData`): filed as an app convenience, because it controls what data loads, not how
   the game plays. Please confirm.
10. **Highest language level** (`languageMax`): this number is marked as a house rule (no book page), but it stays in
    Attributes & skills, because only switches were moved.

## What was not moved, and why

- **Levels of play** keep their own section. The levels are optional book rules (CRB Hong Kong p. 63, Sixth World
  Companion pp. 14–15), but they come as one connected set with their letters and targets. Elite's sum-to-thirteen (a
  house rule) nests under Elite there.
- **Core numbers** stay in their topic sections (Budgets, Attributes & skills, and so on). They are the book's numbers,
  not optional rules.
- **The campaign rules** (`rulesOf`, a campaign's page) and **a runner's Creation rules panel** use the same sections
  (`RuleSections.tsx`), so they changed in the same way.

## Counts

| Classification | Settings |
|---|---|
| Core rule value (numbers) | 109 |
| Core rule toggle | 5 |
| Optional book rule | 44 |
| True house rule | 38 |
| Tool convenience | 14 |
| **Total** | **210** |

10 of these are also marked (needs owner).

## Every setting

The columns are: id; the label and the old group (in italics); what it does in play; the class; where the class comes
from. Per-metatype and per-magic-kind settings, which are made from the catalog (`metatypeKarma:*`,
`pointBuy.startRating:*`, `magicKarma:*`, `lifepath.startRating:*`), are core method values (Sixth World Companion pp.
28–32, 91) and are not listed one by one. The Karma build ones are house rules.

| Id | Label — *old group* | What it does in play | Class | Where |
|---|---|---|---|---|
| `startingKarma` | Starting karma — *General* | The customization Karma every runner starts with; a prime runner doubles it. | Core rule value | CRB Hong Kong p. 66 |
| `qualityNetBonusCap` | Most net karma from qualities — *General* | The most Karma negative qualities may give beyond what the positive ones cost. | Core rule value | CRB Hong Kong p. 66 |
| `qualityMaxCount` | Most paid qualities — *General* | The most qualities a runner takes at creation; its metatype’s own traits never count. | Core rule value | CRB Hong Kong p. 66 |
| `oneAttributeAtMax` | Only one attribute at its maximum — *General* | Only one Physical or Mental attribute may be at its metatype maximum. | Core rule toggle | CRB Hong Kong p. 63 |
| `attributeBaseMax` | Adjustment points go on attributes whose metatype maximum is above — *General* | Adjustment points go only on an attribute whose metatype maximum is above this, and on Edge, Magic and Resonance. | Core rule value | CRB Hong Kong p. 63 |
| `skillCap` | Highest skill rank — *General* | The highest rank a skill may have at creation. | Core rule value | CRB Hong Kong p. 65 |
| `skillCapAptitude` | Highest skill rank with the aptitude quality — *General* | The highest rank of the skill an Aptitude quality names. | Core rule value | CRB Hong Kong p. 65 |
| `aptitudeQuality` | Aptitude quality — *General* | The catalog’s Aptitude quality: the skill its note names may go one rank higher; never on the skill an Incompetent names. | Tool convenience | CRB Hong Kong p. 70 |
| `exceptionalQuality` | Exceptional (Attribute) quality: +1 to the maximum of the attribute its note names, once per attribute (unset: none) — *General* | The catalog’s Exceptional (Attribute) quality: +1 to the maximum of the attribute its note names, once per attribute. | Tool convenience | CRB Hong Kong p. 71 |
| `incompetentQuality` | Incompetent (Skill) quality: no ranks in the skill its note names (unset: none) — *General* | The catalog’s Incompetent (Skill) quality: no ranks in the skill its note names; never on the skill an Aptitude names. | Tool convenience | CRB Hong Kong p. 76–77 |
| `sensitiveSystemQuality` | Sensitive System quality: no Magic or Resonance; ware Essence times the factor below (unset: none) — *General* | The catalog’s Sensitive System quality: no Magic or Resonance, and ware Essence times the factor. | Tool convenience | CRB Hong Kong p. 78 |
| `improvedAbilityPower` | Improved Ability adept power: its skill boosted at most to the factor below (unset: none) — *General* | The catalog’s Improved Ability adept power: the skill its note names, boosted at most to the factor. | Tool convenience | CRB Hong Kong p. 157 |
| `languageMax` | Highest language level; Native counts as it (unset: no cap) — *General* | The highest level any language reaches; the Native language counts as this level and no other goes above it; one Native language only. | True house rule (needs owner) | house rule |
| `fociForcePerMagic` | Foci: their Force together at most Magic times — *General* | The foci’s Force added together is at most Magic times this; no more foci than Magic, none of Force above it. | Core rule value | CRB Hong Kong p. 154 |
| `mentorSpiritQuality` | Mentor Spirit quality: choosing a mentor spirit adds it, removing it removes the mentor spirit (unset: none) — *General* | The catalog’s Mentor Spirit quality: choosing a mentor spirit on the Magic tab adds it with its Karma, and removing it removes the mentor spirit. | Tool convenience | CRB Hong Kong p. 73 |
| `fociBondKarma` | Foci cost their bonding karma at creation — *General* | A focus costs its bonding Karma out of the customization Karma. | Core rule toggle | CRB Hong Kong p. 154, 168 |
| `improvedAbilityFactor` | Improved Ability: the boosted skill at most its rank times (rounded up) — *General* | Improved Ability raises its skill to at most its rank times this, rounded up. | Core rule value | CRB Hong Kong p. 157 |
| `sensitiveSystemEssence` | Sensitive System: cyberware, bioware and nanoware Essence times — *General* | Sensitive System multiplies cyberware, bioware and nanoware Essence by this. | Core rule value | CRB Hong Kong p. 78 |
| `attributeMaxFloor` | Lowest a quality lowers an attribute’s maximum to (Impaired; unset: no floor) — *General* | The lowest a quality (Impaired) lowers an attribute’s maximum to. | Core rule value | CRB Hong Kong p. 76 |
| `manyTalentsQuality` | Many Talents quality: two attributes at their maximum (unset: none) — *General* | The catalog’s Many Talents quality: two attributes may be at their maximum. | Tool convenience | Sixth World Companion p. 134 |
| `manySkillsQuality` | Many Skills quality: two skills at the highest rank (unset: none) — *General* | The catalog’s Many Skills quality: two skills may be at the highest rank. | Tool convenience | Sixth World Companion p. 134 |
| `availabilityCapIllegalOnly` | The Availability cap holds only illegal gear (the core rulebook’s first printing) — *General* | On: the Availability cap holds only illegal gear, as the first printing read it; off: every item is capped. | Optional book rule (needs owner) | the core rulebook’s 2019 printing p. 66 |
| `oneSkillAtMax` | Only one skill at the highest rank — *General* | Only one skill may be at the highest rank at creation. | Core rule toggle | CRB Hong Kong p. 65 |
| `restrictMethods` | Only the creation methods ticked below can be picked (house rule) — *General* | On: a runner can only be built with the creation methods allowed below (the table’s own limit, for organised play, say). | True house rule | house rule |
| `methodAllowed.priority` | Creation method allowed: Priority — *General* | Priority may be picked while the limit on methods is on. | True house rule | house rule |
| `methodAllowed.sumtoten` | Creation method allowed: Sum to ten — *General* | Sum to ten may be picked while the limit on methods is on. | True house rule | house rule |
| `methodAllowed.pointbuy` | Creation method allowed: Point buy — *General* | Point buy may be picked while the limit on methods is on. | True house rule | house rule |
| `methodAllowed.karma` | Creation method allowed: Karma build — *General* | Karma build may be picked while the limit on methods is on. | True house rule | house rule |
| `methodAllowed.lifepath` | Creation method allowed: Lifepath — *General* | Lifepath may be picked while the limit on methods is on. | True house rule | house rule |
| `capacityAccessoryEssence` | An accessory fitted into a host’s Capacity costs its own Essence too (option) — *Augmentation grades* | On: an accessory fitted into a host’s Capacity costs its own Essence too; off: only the host’s, as the books’ sample runners print it. | True house rule (needs owner) | option |
| `karmaSpellsAtCreation` | Extra spells, rituals and complex forms bought with the customization Karma — *General* | On: spells, rituals and complex forms past the free ones can be bought with the customization Karma; off: they can’t, as the later printings say. | Optional book rule (needs owner) | the core rulebook’s 2019 printing p. 68 |
| `skillPointsSpec` | Skill points for a specialization — *General* | Skill points a specialization costs at creation. | Core rule value | CRB Hong Kong p. 65 |
| `skillPointsExpertise` | Skill points for an expertise (unset: bought with karma at the advancement price) — *General* | Skill points an expertise costs at creation, in place of its Karma price; off: bought with Karma. The book disagrees with itself: p. 65 says no expertise with skill points at creation, p. 68 prices one. | Core rule value | book discrepancy, CRB Hong Kong pp. 65, 68 |
| `magicMax` | Highest Magic or Resonance — *General* | The highest Magic or Resonance at creation. | Core rule value | CRB Hong Kong p. 65 |
| `essence` | Starting Essence — *General* | The Essence every runner starts with. | Core rule value | CRB Hong Kong p. 38 |
| `contactPointsPerCha` | Contact points per Charisma — *General* | Contact points per point of Charisma. | Core rule value | CRB Hong Kong p. 67 |
| `knowledgePerLog` | Free knowledge points per point of Logic — *General* | Free Knowledge points per point of Logic. | Core rule value | CRB p. 97 |
| `maxAvailability` | Highest Availability — *General* | The highest Availability of gear bought at creation. | Core rule value | CRB Hong Kong p. 66 |
| `maxNuyenLeft` | Most nuyen kept after creation — *General* | The most nuyen kept after creation; more is a problem a GM can approve. | Core rule value | CRB Hong Kong p. 68 |
| `freeSpellsPerMagic` | Free spells per Magic — *General* | Free spells and rituals per point of Magic. | Core rule value | CRB Hong Kong p. 65 |
| `freeFormsPerResonance` | Free complex forms per Resonance — *General* | Free complex forms per point of Resonance. | Core rule value | CRB Hong Kong p. 66 |
| `maxKarmaLeft` | Most karma kept after creation (unset: no limit) — *General* | The most Karma kept after creation; more is a problem a GM can approve. | Core rule value | CRB Hong Kong p. 66 |
| `ownCarryOver` | Own carry-over limits: the Karma and nuyen kept after creation below, in place of the book’s (house rule) — *General* | On: the GM’s own limits below replace the book’s 5 Karma and 5,000 nuyen kept after creation. | True house rule | house rule |
| `carryOver.karma` | Own carry-over limits: most Karma kept — *General* | The most Karma kept after creation, with the GM’s own limits on. | True house rule | house rule |
| `carryOver.nuyen` | Own carry-over limits: most nuyen kept — *General* | The most nuyen kept after creation, with the GM’s own limits on. | True house rule | house rule |
| `expandedContacts` | Expanded contacts: karma buys contact points past the pool and past a contact’s pair cap — *General* | On: Karma buys contact points past the pool and past a contact’s pair cap, up to the rating below. | Optional book rule | Sixth World Companion p. 161 |
| `contactKarma` | Expanded contacts: karma per contact point past the points or past a contact’s pair cap — *General* | Expanded contacts: Karma per contact point past the pool or past a contact’s pair cap. | Optional book rule | Sixth World Companion p. 161 |
| `contactPairPerCha` | A contact’s connection + loyalty up to Charisma times — *General* | Expanded contacts: a contact’s connection + loyalty up to Charisma times this before Karma pays. | Optional book rule | Sixth World Companion p. 161 |
| `contactRatingMax` | Highest contact rating (unset: Charisma) — *General* | Expanded contacts: the highest connection or loyalty. | Optional book rule | Sixth World Companion p. 161 |
| `karmaAttrPerRank` | Attribute: karma per rank, times the new rating — *Karma prices* | Karma for an attribute rank: this times the new rating. | Core rule value | CRB Hong Kong p. 68 |
| `karmaSkillPerRank` | Skill: karma per rank, times the new rank — *Karma prices* | Karma for a skill rank: this times the new rank. | Core rule value | CRB Hong Kong p. 68 |
| `karmaSpec` | Specialization — *Karma prices* | Karma for a specialization. | Core rule value | CRB Hong Kong p. 68 |
| `karmaKnowledge` | Knowledge or language rank — *Karma prices* | Karma for a knowledge or language rank. | Core rule value | CRB Hong Kong p. 68 |
| `karmaSpell` | Extra spell or ritual — *Karma prices* | Karma for a spell or ritual past the free ones. | Core rule value | CRB Hong Kong p. 68 |
| `karmaForm` | Extra complex form — *Karma prices* | Karma for a complex form past the free ones. | Core rule value | CRB Hong Kong p. 68 |
| `karmaInitiationBase` | Initiation or submersion: base — *Karma prices* | Karma for an initiation or submersion grade: this base. | Core rule value | CRB Hong Kong p. 68 |
| `karmaInitiationPerGrade` | Initiation or submersion: per grade — *Karma prices* | Karma for an initiation or submersion grade: plus this times the new grade. | Core rule value | CRB Hong Kong p. 68 |
| `positiveQualityMultiplier` | Positive qualities cost a multiple of their Karma at creation (option) — *Karma prices* | On: positive qualities cost their Karma times the factor below at creation; off: their printed Karma. | True house rule (needs owner) | option |
| `positiveQualityFactor` | Positive qualities cost their karma times (unset: 1) — *Karma prices* | The factor positive qualities’ Karma is multiplied by, with the multiplier on. | True house rule | option |
| `karmaMartialArt` | Martial arts style — *Karma prices* | Karma for a martial arts style (it comes with its signature technique). | Core rule value | Firing Squad p. 97 |
| `karmaTechnique` | Martial arts technique (a style’s signature one is free) — *Karma prices* | Karma for a martial arts technique past a style’s signature one. | Core rule value | Firing Squad p. 97 |
| `buyPowerPoints` | Mystic adepts buy power points with Karma after creation (house rule) — *Advancement* | On: a mystic adept buys power points after creation for the Karma below; off: only in place of a metamagic at initiation, as the book has it (CRB Hong Kong p. 168). | True house rule | house rule |
| `advance.expertise` | Expertise after creation — *Advancement* | Karma for an expertise (at creation too, when skill points don’t pay for it). | Core rule value | CRB Hong Kong p. 68 |
| `advance.expertiseRank` | Lowest skill rank for an expertise (unset: none) — *Advancement* | The lowest skill rank an expertise needs. | Core rule value | CRB Hong Kong p. 68 |
| `advance.qualityFactor` | A positive quality after creation costs its karma times — *Advancement* | A positive quality taken after creation costs its Karma times this. | Core rule value | CRB Hong Kong p. 69 |
| `advance.buyOffFactor` | Buying off a negative quality costs its karma times — *Advancement* | Buying off a negative quality costs its Karma times this. | Core rule value | CRB Hong Kong p. 69 |
| `advance.skillMax` | Highest skill rank after creation (unset: no cap) — *Advancement* | The highest skill rank after creation. | Core rule value | CRB Hong Kong p. 65 |
| `advance.powerPoint` | Karma per power point (mystic adepts) — *Advancement* | Karma per power point a mystic adept buys after creation, with the rule on. | True house rule | house rule |
| `advance.karmaToNuyenRate` | Nuyen per karma after creation (unset: not offered) — *Advancement* | Working for the Man: nuyen a Karma turns into after creation. | Optional book rule | Sixth World Companion p. 153 |
| `advance.nuyenToKarmaRate` | Nuyen per karma, nuyen to karma (optional rule; unset: off) — *Advancement* | Working for the People: nuyen that turns into a Karma after creation. | Optional book rule | Sixth World Companion p. 153 |
| `karmaToNuyenRate` | Nuyen per karma — *Nuyen* | Nuyen a Karma turns into at creation. | Core rule value | CRB Hong Kong p. 66 |
| `karmaToNuyenRateInDebt` | Nuyen per karma with the in-debt quality — *Nuyen* | Nuyen a Karma turns into at creation with the In Debt quality. | Core rule value | CRB Hong Kong p. 66 |
| `inDebtQuality` | In-debt quality — *Nuyen* | The catalog’s In Debt quality, which changes the Karma-to-nuyen rate. | Tool convenience | CRB Hong Kong p. 77 |
| `stolenGearQuality` | Stolen Gear quality (unset: none) — *Nuyen* | The catalog’s Stolen Gear quality (0 Karma), which changes the Karma-to-nuyen rate and limit; never with In Debt. | Tool convenience | No Future errata, NF p. 162 |
| `karmaToNuyenRateStolenGear` | Nuyen per karma with Stolen Gear — *Nuyen* | Nuyen a Karma turns into at creation with Stolen Gear. | Core rule value | No Future errata, NF p. 162 |
| `karmaToNuyenMaxStolenGear` | Most karma turned into nuyen with Stolen Gear — *Nuyen* | The most Karma turned into nuyen with Stolen Gear, at any rate (refused at creation; after it, a Review warning). | Core rule value | No Future errata, NF p. 162 |
| `stolenGearBuyOff` | Karma to buy off one karma of Stolen Gear’s conversion — *Nuyen* | Karma to buy off one Karma of Stolen Gear’s conversion after creation (bought off a part at a time). | Core rule value | No Future errata, NF p. 162 |
| `karmaToNuyenCap` | A limit on the Karma turned into nuyen at creation (house rule) — *Nuyen* | On: the Karma turned into nuyen at creation is limited to the number below; off: no limit, as the book prints none (CRB Hong Kong p. 66). | True house rule | house rule |
| `karmaToNuyenMax` | Most karma turned into nuyen (unset: no limit) — *Nuyen* | The most Karma turned into nuyen at creation, with the limit on. | True house rule | house rule |
| `dataStructureNuyen` | Data structure: nuyen per level — *Nuyen* | Nuyen per level a data structure costs to buy; its Karma, equal to its level, pays to integrate it (p. 71). | Core rule value | Hack & Slash p. 72 |
| `fakeSinPerRating` | Fake SIN: nuyen per rating — *Nuyen* | Nuyen per rating of a fake SIN. | Core rule value | CRB Hong Kong p. 273 |
| `licencePerRating` | Fake licence: nuyen per rating — *Nuyen* | Nuyen per rating of a fake licence. | Core rule value | CRB Hong Kong p. 273 |
| `sumToTenTarget` | The letters’ values add up to at most — *Sum to ten* | Sum to ten: the priority letters’ values add up to at most this. | Core rule value | Sixth World Companion p. 27 |
| `letterValue:A` | Value of priority A — *Sum to ten* | Sum to ten: what priority A counts. | Core rule value | Sixth World Companion p. 27 |
| `letterValue:B` | Value of priority B — *Sum to ten* | Sum to ten: what priority B counts. | Core rule value | Sixth World Companion p. 27 |
| `letterValue:C` | Value of priority C — *Sum to ten* | Sum to ten: what priority C counts. | Core rule value | Sixth World Companion p. 27 |
| `letterValue:D` | Value of priority D — *Sum to ten* | Sum to ten: what priority D counts. | Core rule value | Sixth World Companion p. 27 |
| `letterValue:E` | Value of priority E — *Sum to ten* | Sum to ten: what priority E counts. | Core rule value | Sixth World Companion p. 27 |
| `pointBuy.total` | Character points — *Point buy* | Point buy: the character points a runner has. | Core rule value | Sixth World Companion p. 28 |
| `pointBuy.awakened` | Character points to be awakened or emerged — *Point buy* | Point buy: character points to be awakened or emerged. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.free.attribute` | Free attribute points — *Point buy* | Point buy: the free attribute points. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.max.attribute` | Most attribute points — *Point buy* | Point buy: the most attribute points. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.free.skill` | Free skill points — *Point buy* | Point buy: the free skill points. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.max.skill` | Most skill points — *Point buy* | Point buy: the most skill points. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.free.adjustment` | Free adjustment points — *Point buy* | Point buy: the free adjustment points. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.max.adjustment` | Most adjustment points — *Point buy* | Point buy: the most adjustment points. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.free.nuyen` | Free nuyen — *Point buy* | Point buy: the free nuyen. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.max.nuyen` | Most nuyen — *Point buy* | Point buy: the most nuyen. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.cost.attribute` | Character points per attribute point — *Point buy* | Point buy: character points per attribute point. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.cost.skill` | Character points per skill point — *Point buy* | Point buy: character points per skill point. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.cost.adjustment` | Character points per adjustment point — *Point buy* | Point buy: character points per adjustment point. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.cost.powerPoint` | Character points per power point — *Point buy* | Point buy: character points per power point. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.cost.mysticPowerPoint` | Character points per power point (mystic adept) — *Point buy* | Point buy: character points per power point for a mystic adept. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.cost.spell` | Character points per spell — *Point buy* | Point buy: character points per spell. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.cost.complexForm` | Character points per complex form — *Point buy* | Point buy: character points per complex form. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.nuyenPerCp` | Nuyen per character point — *Point buy* | Point buy: nuyen per character point. | Core rule value | Sixth World Companion p. 29 |
| `pointBuy.oneSpecialization` | Only one specialization — *Point buy* | Point buy: only one specialization at creation. | Core rule toggle | Sixth World Companion p. 29 |
| `karmaBuildMethod` | Karma build: a creation method no SR6 book describes, with the numbers below (option) — *Karma build* | On: the Karma build can be picked as a creation method, with the numbers below; off: it can’t. No SR6 book prints a Karma build. | True house rule (needs owner) | option (Commlink6 defaults) |
| `karmaBuild.start` | Starting karma (karma build) — *Karma build* | Karma build: the Karma a runner starts with, to buy everything; no SR6 book prints a Karma build. | True house rule | option (Commlink6 defaults) |
| `karmaBuild.startRating` | Starting Magic or Resonance (karma build) — *Karma build* | Karma build: the Magic or Resonance an awakened or emerged runner starts at, before raising it with Karma; no SR6 book prints a Karma build. | True house rule | option (Commlink6 defaults) |
| `karmaBuild.freeSpellsPerMagic` | Free spells per Magic (karma build) — *Karma build* | Karma build: free spells and rituals per point of Magic (0: every one costs its Karma, as the Karma prices have it); no SR6 book prints a Karma build. | True house rule | option (Commlink6 defaults) |
| `karmaBuild.freeFormsPerResonance` | Free complex forms per Resonance (karma build) — *Karma build* | Karma build: free complex forms per point of Resonance (0: every one costs its Karma); no SR6 book prints a Karma build. | True house rule | option (Commlink6 defaults) |
| `lifepath.moduleCount` | Adult life modules to take — *Lifepath* | Lifepath: the adult life modules a runner takes. | Core rule value | Sixth World Companion p. 32 |
| `lifepath.contactRatingCap` | Highest contact rating — *Lifepath* | Lifepath: the highest contact rating. | Core rule value | Sixth World Companion p. 31 |
| `lifepath.bestAttributeBonus` | Best attribute raised by (unset: no raise) — *Lifepath* | Lifepath: the best attribute goes up by this, up to its maximum. | Core rule value | Sixth World Companion p. 32 |
| `lifepath.repeatModules` | Adult modules that may be taken twice (unset: none) — *Lifepath* | Lifepath: adult modules that may be taken twice. | Core rule value | Sixth World Companion p. 32 |
| `lifepath.contactKarma` | Karma per contact rating past the contact points (unset: not offered) — *Lifepath* | Lifepath: Karma per contact rating the contact points don’t cover. | Core rule value | Sixth World Companion p. 31 |
| `lifepath.raisedAttributeStart` | Attributes whose metatype maximum is above the base maximum start at (unset: 1) — *Lifepath* | Lifepath: an attribute whose metatype maximum is raised starts at this. | Core rule value | Sixth World Companion p. 32 |
| `lifepath.mundaneEdge` | Edge a runner neither awakened nor emerged gains (unset: none) — *Lifepath* | Lifepath: Edge a runner neither awakened nor emerged gains. | Core rule value | Sixth World Companion p. 32 |
| `grade:standard:essence` | Standard: Essence times — *Augmentation grades* | Standard grade: its Essence factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:standard:cost` | Standard: cost times — *Augmentation grades* | Standard grade: its cost factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:standard:avail` | Standard: Availability plus — *Augmentation grades* | Standard grade: its Availability modifier. | Core rule value | CRB Hong Kong p. 282 |
| `grade:alpha:essence` | Alpha: Essence times — *Augmentation grades* | Alpha grade: its Essence factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:alpha:cost` | Alpha: cost times — *Augmentation grades* | Alpha grade: its cost factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:alpha:avail` | Alpha: Availability plus — *Augmentation grades* | Alpha grade: its Availability modifier. | Core rule value | CRB Hong Kong p. 282 |
| `grade:beta:essence` | Beta: Essence times — *Augmentation grades* | Beta grade: its Essence factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:beta:cost` | Beta: cost times — *Augmentation grades* | Beta grade: its cost factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:beta:avail` | Beta: Availability plus — *Augmentation grades* | Beta grade: its Availability modifier. | Core rule value | CRB Hong Kong p. 282 |
| `grade:delta:essence` | Delta: Essence times — *Augmentation grades* | Delta grade: its Essence factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:delta:cost` | Delta: cost times — *Augmentation grades* | Delta grade: its cost factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:delta:avail` | Delta: Availability plus — *Augmentation grades* | Delta grade: its Availability modifier. | Core rule value | CRB Hong Kong p. 282 |
| `grade:used:essence` | Used: Essence times — *Augmentation grades* | Used grade: its Essence factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:used:cost` | Used: cost times — *Augmentation grades* | Used grade: its cost factor. | Core rule value | CRB Hong Kong p. 282 |
| `grade:used:avail` | Used: Availability plus — *Augmentation grades* | Used grade: its Availability modifier. | Core rule value | CRB Hong Kong p. 282 |
| `monitorBase` | Condition monitor: boxes before the attribute — *Derived values* | Condition monitor boxes before the attribute’s share. | Core rule value | CRB Hong Kong p. 38 |
| `monitorDivisor` | Condition monitor: the attribute divided by (rounded up) — *Derived values* | A condition monitor adds its attribute divided by this, rounded up. | Core rule value | CRB Hong Kong p. 38 |
| `initiativeDice` | Initiative dice — *Derived values* | Initiative dice a runner rolls before augmentations. | Core rule value | CRB Hong Kong p. 67 |
| `initiativeDiceMax` | Most initiative dice (unset: no cap) — *Derived values* | Never more initiative dice than this. | Core rule value | CRB Hong Kong p. 39 |
| `astralInitiativeDice` | Astral initiative dice — *Derived values* | Astral initiative dice. | Core rule value | CRB Hong Kong p. 161 |
| `specDice` | Dice for a specialization — *Derived values* | Dice a specialization adds. | Core rule value | CRB Hong Kong p. 92 |
| `expertiseDice` | Dice for an expertise — *Derived values* | Dice an expertise adds. | Core rule value | CRB Hong Kong p. 92 |
| `untrainedPenalty` | Dice off the attribute for an untrained skill — *Derived values* | Dice off an attribute for a skill without ranks. | Core rule value | CRB Hong Kong p. 93 |
| `overflowPerBody` | Damage Overflow boxes per point of Body — *Derived values* | Damage Overflow boxes per point of Body. | Core rule value | CRB Hong Kong p. 121 |
| `attributeAugmentMax` | Most an attribute’s augmented value is above its natural one (unset: no cap) — *Derived values* | An attribute’s augmented value is at most its natural one plus this. | Core rule value | CRB Hong Kong p. 37 |
| `skillAugmentMax` | Most a skill’s dice pool is raised by bonuses (unset: no cap) — *Derived values* | A skill’s dice pool is raised by bonuses at most this much. | Core rule value | CRB Hong Kong p. 39 |
| `monitorMinimum` | Fewest boxes a quality can lower a condition monitor to (unset: no floor) — *Derived values* | The fewest boxes a quality (Glass Jaw) lowers a condition monitor to. | Core rule value | CRB Hong Kong p. 76 |
| `matrixColdDice` | VR initiative, cold sim: dice added to the usual ones — *Derived values* | VR cold sim: initiative dice added to the usual one. | Core rule value | CRB Hong Kong p. 179 |
| `matrixHotDice` | VR initiative, hot sim: dice added to the usual ones — *Derived values* | VR hot sim: initiative dice added to the usual one. | Core rule value | CRB Hong Kong p. 179 |
| `moveWalk` | Metres for a Move — *Derived values* | Metres a Move covers. | Core rule value | CRB Hong Kong p. 42 |
| `moveSprint` | Metres for a Sprint — *Derived values* | Metres a Sprint covers before its hits. | Core rule value | CRB Hong Kong p. 44 |
| `moveSprintPerHit` | Sprint: metres more per hit — *Derived values* | Metres a Sprint adds per hit. | Core rule value | CRB Hong Kong p. 44 |
| `unarmedDV` | Unarmed Damage Value (Stun) — *Derived values* | Base unarmed Damage Value (Stun). | Core rule value | CRB Hong Kong p. 94 |
| `arDrEdgeGap` | Attack Rating against Defense Rating: the lead that gains a point of Edge — *Derived values* | An Attack Rating this far ahead of the Defense Rating (or the reverse) gains a point of Edge. | Core rule value | CRB Hong Kong p. 45 |
| `levelStreet` | Street level: each priority gives the values of the row below (E stays E) — *Levels of play* | On: each priority gives the values of the row below it (E stays E). | Optional book rule | CRB Hong Kong p. 63 |
| `levelPrime` | Prime runner: twice the customization karma — *Levels of play* | On: twice the customization Karma. | Optional book rule | CRB Hong Kong p. 63 |
| `levelSwcStreet` | Street-level (Sixth World Companion): the letters, targets and module count below; no illegal gear but cyberdecks — *Levels of play* | On: street-level letters, targets and module count below; no illegal gear but cyberdecks. | Optional book rule | Sixth World Companion p. 14–15 |
| `swcStreet.sumToTen` | Street-level: sum-to-ten target — *Levels of play* | Street-level: sum-to-eight. | Optional book rule | Sixth World Companion p. 15 |
| `swcStreet.pointBuy` | Street-level: character points — *Levels of play* | Street-level: the character points. | Optional book rule | Sixth World Companion p. 15 |
| `swcStreet.modules` | Street-level: adult life modules — *Levels of play* | Street-level: the adult life modules. | Optional book rule | Sixth World Companion p. 15 |
| `swcStreet.karmaBuild` | Street-level: Karma build starting karma — *Levels of play* | Street-level with the Karma build: the Karma a runner starts with, in place of the standard level's; no SR6 book prints a Karma build. | True house rule | option (Commlink6 defaults) |
| `swcStreet.letters` | Street-level: the priority letters — *Levels of play* | Street-level: the priority letters (B, C, C, D, E). | Optional book rule | Sixth World Companion p. 14 |
| `levelSwcElite` | Elite (Sixth World Companion): the letters, targets and module count below; no Availability cap — *Levels of play* | On: elite letters, targets and module count below; no Availability cap. | Optional book rule | Sixth World Companion p. 15 |
| `swcElite.sumToTen` | Elite: sum-to-ten target — *Levels of play* | Elite: sum-to-twelve. | Optional book rule | Sixth World Companion p. 15 |
| `swcElite.pointBuy` | Elite: character points — *Levels of play* | Elite: the character points. | Optional book rule | Sixth World Companion p. 15 |
| `swcElite.modules` | Elite: adult life modules — *Levels of play* | Elite: the adult life modules. | Optional book rule | Sixth World Companion p. 15 |
| `swcElite.karmaBuild` | Elite: Karma build starting karma — *Levels of play* | Elite with the Karma build: the Karma a runner starts with, in place of the standard level's; no SR6 book prints a Karma build. | True house rule | option (Commlink6 defaults) |
| `swcElite.letters` | Elite: the priority letters — *Levels of play* | Elite: the priority letters (A, B, B, C, D). | Optional book rule | Sixth World Companion p. 15 |
| `priorityLetters` | The priority letters a runner takes, one a column (unset: A, B, C, D and E once each) — *Levels of play* | The priority letters a runner takes, one a column (A, B, C, D and E once each). | Optional book rule | CRB Hong Kong p. 63 |
| `meleeArStrength` | STR adds to a melee weapon’s Attack Rating — *Derived values* | Strength adds to a melee weapon’s Attack Rating. | Core rule toggle | CRB Hong Kong p. 39 |
| `stackingAdvantage` | Stacking Advantage: a lead of twice the gap gains 2 Edge — *Optional rules* | On: a lead of twice the Edge gap gains 2 Edge. | Optional book rule | Sixth World Companion p. 144 |
| `strengthInCloseCombat` | Close Combat rolls STR; AGI goes into the melee Attack Ratings — *Optional rules* | On: Close Combat rolls Strength, and Agility goes into a melee Attack Rating in place of Strength. | Optional book rule | Sixth World Companion p. 150 |
| `highStrengthDamage` | High STR adds to melee and unarmed Damage Values — *Optional rules* | On: high Strength adds to melee and unarmed Damage Values at the steps below. | Optional book rule | Sixth World Companion p. 150 |
| `alternateMysticAdept` | Alternate Mystic Adept: half a power point per point of Magic, and per Magic raised; no Conjuring or Enchanting — *Optional rules* | On: a mystic adept gets half a power point per point of Magic, and no Conjuring or Enchanting. | Optional book rule | Sixth World Companion p. 148 |
| `twentyQuestions` | Twenty Questions: karma at creation for answering ten of the questions — *Optional rules* | On: Karma at creation for answering ten of the twenty questions. | Optional book rule | Sixth World Companion p. 25 |
| `twentyQuestionsKarma` | Twenty Questions: the karma — *Optional rules* | Twenty Questions: the Karma it gives. | Optional book rule | Sixth World Companion p. 25 |
| `workingForTheMan` | Working for the Man: karma turned into nuyen after creation, at the rate under Advancement — *Optional rules* | On: a week of downtime turns Karma into nuyen after creation, at the rate under Advancement. | Optional book rule | Sixth World Companion p. 153 |
| `workingForThePeople` | Working for the People: nuyen turned into karma after creation, at the rate under Advancement — *Optional rules* | On: a week of downtime turns nuyen into Karma after creation, at the rate under Advancement. | Optional book rule | Sixth World Companion p. 153 |
| `expandedSpecializations` | Expanded Specializations: any number of specializations a skill (one expertise) — *Optional rules* | On: any number of specializations a skill (still one expertise). | Optional book rule | Sixth World Companion p. 153 |
| `unrestrictedSkillRanks` | Unrestricted Skill Ranks: no highest skill rank after creation — *Optional rules* | On: no highest skill rank after creation (never at creation). | Optional book rule | Sixth World Companion p. 153 |
| `suprathyroidStacks` | Suprathyroid gland bonuses stack with other augmentations’ — *Optional rules* | On: the suprathyroid gland’s bonuses stack with other augmentations’ (the +4 cap still holds). | Optional book rule | Sixth World Companion p. 149 |
| `infectedAllowed` | Infected player characters allowed: the Infected qualities and optional powers are offered — *Optional rules* | On: a runner may take the Infected qualities and buy the Infected optional powers with Karma, at creation and after; off: they are hidden from the pickers and refused. | Optional book rule | Sixth World Companion p. 104 |
| `infectedPowersAtCreation` | Infected optional powers at creation (GM override): bought at creation, not only after — *Optional rules* | On: an Infected runner may buy its type’s optional powers at creation; off: only its one free pick at creation, the rest after (“in general”, p. 105). | Optional book rule | Sixth World Companion p. 105 |
| `cl6OnlyData` | Optional data set: records no book prints, from custom/sr6/cl6only/ (the server’s setting; off: none load) — *Optional rules* | On: the catalog also loads the optional data set the admin put in custom/sr6/cl6only/ (records no book prints, each under a source of its own marked Non-canon); off: nothing from it loads. Only the server’s setting counts. | Tool convenience (needs owner) | option |
| `strengthDamageStep1` | High STR: the STR for +1 Damage Value — *Optional rules* | High Strength: the Strength that adds +1 Damage Value. | Optional book rule | Sixth World Companion p. 150 |
| `strengthDamageStep2` | High STR: the STR for +2 Damage Value — *Optional rules* | High Strength: the Strength that adds +2 Damage Value. | Optional book rule | Sixth World Companion p. 150 |
| `exoticFirstSpecFree` | Exotic Weapons: the first specialization costs nothing (house rule) — *Optional rules* | On: the first Exotic Weapons specialization costs no skill points or Karma. | True house rule | house rule |
| `mentorBothAdvantages` | A mystic adept gets both its mentor spirit’s magician and adept advantages (house rule) — *Optional rules* | On: a mystic adept gets both the magician’s and the adept’s advantages of its mentor spirit; off: it picks one, for good (CRB Hong Kong pp. 162–163). | True house rule | house rule |
| `dataStructureCaps` | Caps on a technomancer’s data structures at creation: the count and level below (house rule) — *Optional rules* | On: Review flags a technomancer’s data structures past the count or level below, a problem a GM can approve. | True house rule | house rule |
| `dataStructure.maxCount` | Data structure caps: most data structures — *Optional rules* | The most data structures a runner has at creation, with the caps on. | True house rule | house rule |
| `dataStructure.maxRating` | Data structure caps: highest level — *Optional rules* | The highest data structure level at creation, with the caps on. | True house rule | house rule |
| `noUsedCulturedBioware` | No used (or omega) grade on cultured bioware (house rule) — *Optional rules* | On: cultured bioware can’t be used (or omega) grade; off: it can, as the books print no exclusion. | True house rule | house rule |
| `gradeCapAtCreation` | Caps on the initiation, submersion and transhumanist grade at creation: the grades below (house rule) — *Optional rules* | On: Review flags an initiation or submersion grade at creation above the caps below, a problem a GM can approve (a grade is never above Magic or Resonance anyway). | True house rule | house rule |
| `transhumanism` | Transhumanism: a mundane buys transhumanist grades, each an Essence hole of 1.0 (option) — *Optional rules* | On: a mundane runner buys transhumanist grades for 10 + the next grade in Karma (the initiation price), up to 20, and each gives an Essence hole of 1.0 that augmentations’ Essence is paid from first; off: none. | Optional book rule | Sixth World Companion p. 146 |
| `allowAnimalism` | Animalism: shifters and others buy animalism powers (Bestial Nature) — *Optional rules* | On: a runner may buy animalism powers, 10 + the grade in Karma each grade, outside initiation (mundanes too); off: they are refused at creation. | Optional book rule | Bestial Nature p. 21 |
| `allowSurge` | SURGE: metagenic qualities and SURGE collectives (Sixth World Companion) — *Optional rules* | On: a runner may take metagenic qualities (at most 30 Karma of them) and a SURGE collective; off: they are refused at creation. | Optional book rule | Sixth World Companion p. 116 |
| `animalismMaxAtCreation` | Animalism: highest animalism grade at creation — *Optional rules* | The highest animalism grade at creation (2 when unset). | Optional book rule | Bestial Nature p. 21 |
| `gradeCap.initiation` | Grade caps: highest initiation grade at creation — *Optional rules* | The highest initiation grade at creation, with the caps on. | True house rule | house rule |
| `gradeCap.submersion` | Grade caps: highest submersion grade at creation — *Optional rules* | The highest submersion grade at creation, with the caps on. | True house rule | house rule |
| `gradeCap.transhuman` | Grade caps: highest transhumanist grade at creation — *Optional rules* | The highest transhumanist grade at creation, with the caps on. | True house rule | house rule |
| `adjustOnLoweredMax` | Adjustment points also on an attribute whose metatype maximum is lowered (house rule) — *Optional rules* | On: adjustment points may also go on an attribute whose metatype maximum is lowered; off: only on raised maxima, Edge, Magic and Resonance (CRB Hong Kong p. 63). | True house rule | house rule |
| `pointBuyErrataNuyen` | Point buy: up to 450,000 nuyen bought with character points, the errata version (house rule) — *Optional rules* | On: point buy’s nuyen bought with character points goes up to 450,000, the errata version; off: up to 440,000 as printed (Sixth World Companion p. 29). | True house rule (needs owner) | house rule |
| `knowledgeLogicIntuition` | Optional: (Logic + Intuition) × 2 Knowledge points — *Optional rules* | Optional rule (CRB p. 98): free Knowledge points = (Logic + Intuition) × 2; off (default): Logic only (p. 97). | Optional book rule (needs owner) | CRB p. 98 |
| `magicAboveSixByGrade` | Magic or Resonance at creation up to the highest plus the initiation or submersion grade (option) — *Optional rules* | On: Magic or Resonance at creation up to the highest plus the initiation or submersion grade; off: the highest alone (CRB Hong Kong p. 65). | Optional book rule | option, CRB Hong Kong p. 167 |
| `eliteSumToThirteen` | Elite: sum-to-thirteen instead of sum-to-twelve (house rule) — *Optional rules* | On, with Elite: sum-to-thirteen, the total of Elite’s own letters, instead of the sum-to-twelve the book prints. | True house rule | house rule |
| `availabilitySeven` | Gear of Availability 7 at creation (house rule) — *Optional rules* | On: gear of Availability 7 may be bought at creation; off: 6 at most (CRB Hong Kong p. 66). | True house rule | house rule |
| `cargoWithoutSeats` | Vehicles: seats removed add cargo space (option) — *Optional rules* | On: a vehicle’s seats removed add cargo space by the Cargo Factor formula (1.5 CF a seat, 1.25 on a bike). | Optional book rule | option, Double Clutch p. 126 |
| `metatypeSizePricing` | Price modifiers: the metatype’s, qualities’ and ware’s PRICEMOD (troll-sized +10% on everything, dwarf-sized +10% on armor) — *Optional rules* | On: the PRICEMOD data apply, as one line of the nuyen budget: the metatype’s (troll-sized +10% on everything bought, dwarf-sized +10% on armor), and the qualities’ and ware’s (Shiva Arms, Bone Spikes, Thorns, bark: more on armor); off: none (on by default: owner ruling 5, 2026-10-31, a book rule a GM may turn off). | Optional book rule (needs owner) | CRB p. 64, Sixth World Companion pp. 91–92 |
| `builtToughQuality` | Built Tough quality: a Physical box per level (unset: none) — *Derived values* | The catalog’s Built Tough quality: a Physical box per level. | Tool convenience | CRB Hong Kong p. 70 |
| `dermalDepositsQuality` | Dermal Deposits quality: +1 Defense Rating (unset: none) — *Derived values* | The catalog’s Dermal Deposits quality: +1 Defense Rating, Physical unarmed damage. | Tool convenience | CRB Hong Kong p. 71 |
| `charismaticDefenseQuality` | Charismatic Defense quality: Defense Rating from Charisma, not Body (unset: none) — *Derived values* | The catalog’s Charismatic Defense quality: Defense Rating from Charisma instead of Body. | Tool convenience | Power Plays p. 85 |

## Owner rulings (2026-11-03)

1. capacityAccessoryEssence: book rule, add-ons in a host's Capacity cost no Essence; switch removed (done 350bcb46).
2. pointBuyErrataNuyen: errata book rule, 450,000¥ is the default; the switch becomes "GM sets the limit" with a number the GM chooses.
3. knowledgeLogicIntuition: optional book rule in the current (Hong Kong) printing, CRB p.98; keep the switch, default off, under Optional rules (book).
4. metatypeSizePricing: book rule (ruled 2026-10-31), citation = CRB Hong Kong printing p.64; no play change.
5. availabilityCapIllegalOnly: default = current book (cap on everything); keep the switch as an optional book rule (2019 printing), off. Same principle for old-printing options.
6. karmaSpellsAtCreation: same as 5: default current book (no extra spells for Karma), switch kept as optional book rule (2019 printing), off.
7. karmaBuildMethod: house rule, off by default (no change).
8. positiveQualityMultiplier: house rule, off by default (no change).
9. cl6OnlyData: app convenience, off by default (no change).
10. languageMax: book rule (core value, not house): learned languages top out at Expert, one free Native, a second Native only via Bilingual; cite CRB HK (app's existing pp. 67, 99). Quality pickers stay App conveniences.
