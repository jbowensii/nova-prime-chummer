# Shadowrun 6 character file format

A Shadowrun 6 runner is one XML file, apart from Anarchy's: the server stores it in `characters/sr6/<username>/`
(`/api/sr6/characters`), and **Export** on the SR6 runners page downloads it. The schema is
`public/data/sr6/schema/character.xsd` (namespace `urn:chummer-sr6:character:1`); `src/sr6/engine/charxml.ts` reads and
writes it. Each game refuses the other's file and says where it belongs.

The file holds what the player chose and spent, never totals: budgets, rule checks and derived values (monitors, Defense
Rating, dice pools) are computed from the build, the catalog and the table's creation rules each time the runner opens.

```xml
<?xml version="1.0" encoding="UTF-8"?>
<sr6:character xmlns:sr6="urn:chummer-sr6:character:1" formatVersion="1" id="…" rev="4" streetName="Sparky"
    name="Pat Doe" gender="…" metatype="crb.glimmerkin" method="priority" backdrop="neon" finalizedAt="…" campaign="…"
    updatedAt="…" lastExportedAt="…" finalKarma="3" finalNuyen="1250">
  <portrait>data:image/png;base64,…</portrait>
  <token>data:image/png;base64,…</token>
  <background>…</background>
  <notes>…</notes>
  <printed source="CRB" page="81"><value key="rea" value="5(7)"/><value key="init" value="8(10) + 3D6"/>…</printed>
  <build method="priority" magic="aspected" aspectedSkill="crb.hexing" tradition="Street hoodoo" drainAttr="cha"
      powerPointsBought="0" initiation="1" submersion="0" karmaToNuyen="3">
    <priority column="metatype" letter="D"/> …          (5; no letter: not assigned yet)
    <cp pool="attribute" points="0"/> …                  (7: point buy's character points per pool)
    <lifemodule id="crb.glow-apprentice"><choice index="0" pick="skill:crb.hexing"/></lifemodule>
    <attribute id="agi" points="3" adjust="1" karma="0"/> …   (11: bod agi rea str wil log int cha edg mag res)
    <skill id="crb.gab" points="5" karma="1" spec="…" expertise="…"/>
    <knowledge uid="k1" kind="language" native="true" points="0" karma="0">…</knowledge>
    <quality uid="q1" id="crb.moonsight" level="1" free="true" name="Moonsight"/>
    <pick uid="p2" kind="adeptpowers" id="crb.quick-step" level="2"><bonus target="rea" value="1" perRating="true"/></pick>
    <martialart uid="m1" id="crb.glow-fist" name="Glow Fist"><technique uid="m1t" id="crb.glow-jab" name="Glow Jab"/></martialart>
    <purchase uid="g1" kind="weapons" id="crb.zap-gun" qty="1">
      <purchase uid="g2" kind="gear" id="crb.zap-scope" qty="1"/>
      <snapshot><weapon id="crb.zap-gun" source="CRB" page="…" …><name>Zap Gun</name>…<text/></weapon></snapshot>
    </purchase>
    <purchase uid="g5" kind="gear" name="Lucky coin" cost="7.5" avail="1" essence="0.1" qty="3" note="…"/>
    <contact uid="c1" name="Gil" archetype="Fixer" connection="3" loyalty="2"/>
    <sin uid="s1" name="Pat Roe" kind="fake" rating="3" gender="…"><licence name="Zap Gun" rating="2"/>
      <lifestyle uid="l1" id="crb.cozy" months="2"/></sin>
    <sin uid="s2" name="Pat Doe" kind="real"/>
  </build>
  <house><quality id="street.lucky-socks" source="STREET" page="1" kind="positive" karma="7"><name>Lucky Socks</name><text>…</text></quality></house>
  <override code="skill.cap" path="skills.crb.gab">GM ok</override>
</sr6:character>
```

## Root

`metatype` and `method` repeat the build's, so a server can list runners without reading the build. `metatype=""` is a
draft with none picked yet. `finalizedAt`, `finalKarma` and `finalNuyen` are set by Finalize (the karma and nuyen left);
`campaign` is set through the server. `rev` is the server's revision counter and is left out of exports. `sampleKey`:
see NPCs below.

`<printed>` (a book sample, from the importer): its stat block's numbers as the book prints them, with the book's
`source` and `page`. `key` is an attribute abbreviation (`5(7)`: natural and augmented), `ess`, `init` (`8(10) + 3D6`),
`cm` (`11/10`, Physical/Stun) or `dr`. Review compares each with what the rules give and warns where they differ ("REA:
the book prints 4(6); the rules give 4(7)", the page cited); the file never corrects them. A copy keeps them.
`level:<quality id>` keeps a level printed on a quality that has none (`Magic Resistance 2`): the quality is taken once,
and Review notes "The book prints Magic Resistance 2; Magic Resistance has no levels (CRB p.72)", never an error.

`<rules>` (after `<printed>`): the runner's own choices of the optional creation rules, over the table's (the server's or
its campaign's own): `<setting key value assumed? source? page?/>`, `value=""` turning a setting off. A setting its
campaign's GM locked keeps the table's value (Review notes the choice is set aside). `assumed`: a book sample's, taken
from its numbers where a book rule explains them (the prime runner's 100 Karma, CRB p. 64); Review notes it ("assumed from
the book's numbers (the book doesn't say)"). None: the table's rules, as before.

`<migrated from to at>` (last): a catalog id the runner named that a re-import renamed, moved or re-kinded, turned into
the new one when the runner was opened (`from` and `to` are `<kind>/<id>`; the entry's `<alias id kind>`,
docs/sr6-data-format.md). Purchases and their accessories, picks, martial arts and their techniques, qualities, the lifestyles, the metatype and the ledger's
lines are turned when the new entry's kind fits the line; a line whose entry is gone with no successor keeps its id and
its snapshot.

`<house>` (after the ledger): copies of the GM compendium entries the runner uses (its qualities, picks, martial arts and
their techniques, purchases and accessories, lifestyles; career spends included), in the SR6 data files' own format with their text, refreshed on every
change while the compendium is readable. When it no longer is (unshared or deleted), each copy stands in for its entry
(prices, rules, sheet and exports) and Review notes "its source … is no longer available; the runner keeps its own
copy". Book entries are never copied here.

## Build

- `method`: `priority`, `sumtoten`, `pointbuy`, `karma` or `lifepath`. `magic`: `full`, `aspected`, `mystic-adept`,
  `adept`, `technomancer` or `mundane`; an aspected magician names its one Magic skill in `aspectedSkill`. `tradition` is
  free text; `drainAttr` is `log`, `int` or `cha`.
- Spends are counts: attribute `points` (from the attribute pool), `adjust` (adjustment points) and `karma` (ranks bought
  with karma); a skill's `points` and `karma` likewise. A missing number reads as 0.
- `<lifemodule>`: an adult life module taken (lifepath; the same one twice when the table allows it, each copy with its
  own choices); each `<choice>` is the option picked for the module's mixed choice at that index: an attribute
  abbreviation, `skill:<id>` or `nuyen:<n>`. `bestAttr` and `bestExtra` (on `<build>`, lifepath): the best attribute and
  the one that takes what its metatype maximum leaves over, core attributes only.
- `<contact types>`: one or two of the Sixth World Companion's contact types (`academic`, `corporate`, `criminal`,
  `engineering`, `government`, `magic`, `matrix`, `media`, `medical`, `street`); lifepath's contact points go by type.
- `<quality free="true">`: a metatype trait, free and not removable. `name` (on a quality, pick or purchase): the
  catalog name when it was added, shown if the entry later leaves the catalog. `<quality karma>`: for a quality priced
  in a range (`karma`–`karmaMax`, as Allergy's severity sets it), the karma it was taken for; unset, the lowest.
- `<pick kind>`: `spells`, `rituals`, `adeptpowers`, `complexforms`, `metamagics` or `echoes`; `level` for leveled powers
  and for a metamagic taken again (its catalog `perLevel`: the times taken, each one initiation grade's metamagic).
- `<martialart id>` (after the picks): a martial arts style (catalog `martialarts`), with a `<technique id>` (catalog
  `martialtechniques`) for each technique learned under it, its signature one included (Firing Squad p. 97: it comes
  free with the style). `name` on either: the catalog name when added. A file without any reads as none. Edited on the
  Martial arts tab; a technique's prerequisites are the catalog's (`<requires>`, docs/sr6-data-format.md), never stored
  here. An `<override>` of a martial arts check has the path `martial.<style uid>` (a missing augmentation's:
  `martial.<style uid>.<technique uid>`).
- `<purchase kind>`: `weapons`, `armor`, `augmentations`, `electronics`, `programs` (programs and autosofts), `gear`, `vehicles` or `ammotypes` (an ammunition type, from a line bought as gear
  before the importer filed ammunition types apart); `rating` for rated
  items, `grade` for augmentations, `worn` for armor. No `id`: a custom item at the player's own `cost`, `avail` and
  `essence`. Nested `<purchase>`s are accessories fitted to it. `<snapshot>` holds the catalog entry in the SR6 data
  files' own format (docs/sr6-data-format.md), without its description; Export writes it so the line still reads when
  the entry is gone.
- `<bonus target value perRating?>` (on an accessory: what it adds to its host item, not the runner): what a ware, power or item adds, entered by the player (the catalog has no bonus
  data; a line with none counts its catalog entry's `add` effects instead, the low-confidence ones never). `target` is an
  attribute abbreviation, `initDice`, `defense` (Defense Rating), `physical` (Physical condition monitor boxes: a full
  cyberlimb's, CRB p. 288) or `skill` (that skill's dice pool:
  `skill` holds the catalog skill's id, `<bonus target="skill" skill="crb.firearms" value="1"/>`); `perRating`: times the
  line's rating.
- `<sin kind="real|fake" rating? gender? placeholder?>` with its `<licence>`s and the `<lifestyle uid id months>`s paid
  under it: a lifestyle always belongs to a SIN, a SIN may have none, and a runner may have several of each. `gender` is
  that identity's own (optional; the runner's is the root's `gender`). `placeholder="true"`: an unnamed stand-in
  (`name=""`, `kind="real"`, no rating, free) holding an older file's lifestyle; Review warns until the player names it
  or sets its kind or rating (which makes it a normal SIN), or moves the lifestyle to another SIN.
- An older file's one `<lifestyle id months>` directly in `<build>` (before lifestyles belonged to SINs) loads onto the
  first `<sin>`; a runner with no SIN gets a placeholder SIN (`uid` the runner's id + `-sin`) to hold it. The same
  happens for a runner whose ledger has an older `lifestyle` spend and no SIN. The file is written the new way on its
  next save.

## Career ledger

A finalized runner's career spends are the `<ledger>` after `<build>` (left out while empty; a file without one reads
as an empty ledger). The build stays as finalized: the runner as it stands is the build with every live advance since
the last finalize entry replayed on it (`src/sr6/engine/career.ts`). The ledger is append-only; a `void` entry undoes
the entry its `event` names.

```xml
  <ledger>
    <entry id="l-1" at="…" type="finalize" karma="31" nuyen="4350"/>
    <entry id="l-2" at="…" type="earn" karma="9" nuyen="3100" date="2026-10-04">Made-up run</entry>
    <entry id="l-3" at="…" type="advance" karma="12" nuyen="0" op="attribute" target="agi" label="AGI 3 → 4"/>
    <entry id="l-5" at="…" type="advance" karma="0" nuyen="290" op="purchase" label="Zap Gun"><purchase …/></entry>
    <entry id="l-8" at="…" type="void" event="l-7">Picked the wrong metamagic</entry>
    <entry id="l-9" at="…" type="note">Owes Fixer Fred a favour</entry>
  </ledger>
```

- `type`: `finalize` (sets both balances), `earn` (adds; the text is the run), `advance` (a spend: `karma` and `nuyen`
  spent, negative when gained; `label` says what was bought), `note` (the text) or `void` (`event`: the entry undone;
  the text is the reason). An unknown `type` or `op` is refused; repair drops the entry ("Dropped ledger entry 3: …").
- `op` (advance): `attribute` and `skill` (`target`: the attribute abbreviation or skill id; +1), `spec` and `expertise`
  (`target` skill, `name`), `knowledge`, `quality`, `pick`, `purchase` and `contact` (the line added, as its build
  element), `buyoff` and `drop` (`target`: the uid of the line removed; the removed line may follow for the history),
  `initiate` (an optional metamagic or echo `<pick>`), `sin` (the `<sin>` bought, with its licences and no lifestyles:
  priced as creation prices it, a fake SIN's rating × `fakeSinPerRating`, a real one free, plus its licences' ratings ×
  `licencePerRating`; a `uid` naming a placeholder SIN names it and makes it a normal SIN, its lifestyles kept),
  `martialart` (the style with its signature `<technique>`), `technique` (`target`: the uid of the style it is learned under; the `<technique>`), `powerpoint`, `lifestyle` (`lifestyle` id, `months`, `sin`: the
  uid of the SIN it's paid under, `uid`: the new lifestyle's; more months of a lifestyle that SIN has add to it; an older
  entry has no `sin` and goes to the first SIN's lifestyle, more months of it or another replacing it), `convert`
  (the entry's `karma`: positive turns karma into nuyen, negative nuyen into karma) and `other`.

## NPCs

An SR6 NPC is the same file with `<npc>` as the root's **first child** (the server keeps NPCs and runners apart by it)
and a blank build. Its stat block is copied from the catalog entry it was made from, or entered by the GM:

```xml
<sr6:character … streetName="Corner Goon" sampleKey="CRB|crb.corner-goon">
  <npc kind="grunt" rating="2" group="Street Crew" fromKind="npcs" fromId="crb.corner-goon" fromName="Corner Goon"
      fromSource="CRB" fromPage="205"><stat key="bod" value="3"/>…<line part="skills">Close Combat 4, Firearms 3</line></npc>
  <build …/>
</sr6:character>
```

- `kind`: `grunt`, `contact` (one of the book's sample contacts), `critter`, `spirit` or `sprite`; `rating` the
  Professional Rating, Force or Level; `group` a grunt's.
- `<stat key value>`: a printed value (key `a`–`z`, at most 20 letters; value at most 80 characters, e.g. `F+1`).
- `<line part>`: `skills`, `powers`, `optionalPowers`, `weaknesses`, `attacks`, `augmentations`, `gear` or `weapons`.
- `sampleKey` (root): the catalog entry a book NPC was loaded from, `<source>|<id>`. An example runner (Load example
  characters on Your runners) has the book sample it was copied from, `<source>|<sample id>`.
- The runners page refuses an NPC file ("Import it on NPCs & Critters") and the NPC page a runner.

## Reading bad files

As Anarchy's: a character XML can't hold (a control character) is refused with its line and column; **Try to repair**
removes it, escapes stray `&`, and drops any child that can't be read ("Dropped purchase 3: qty="x" isn't a number.").
An unknown `method` or `magic` is refused; repair sets `priority` or `mundane` and says so.
