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
    name="Pat Doe" metatype="crb.glimmerkin" method="priority" backdrop="neon" finalizedAt="…" campaign="…"
    updatedAt="…" lastExportedAt="…" finalKarma="3" finalNuyen="1250">
  <portrait>data:image/png;base64,…</portrait>
  <token>data:image/png;base64,…</token>
  <background>…</background>
  <notes>…</notes>
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
    <purchase uid="g1" kind="weapons" id="crb.zap-gun" qty="1">
      <purchase uid="g2" kind="gear" id="crb.zap-scope" qty="1"/>
      <snapshot><weapon id="crb.zap-gun" source="CRB" page="…" …><name>Zap Gun</name>…<text/></weapon></snapshot>
    </purchase>
    <purchase uid="g5" kind="gear" name="Lucky coin" cost="7.5" avail="1" essence="0.1" qty="3" note="…"/>
    <contact uid="c1" name="Gil" archetype="Fixer" connection="3" loyalty="2"/>
    <lifestyle id="crb.cozy" months="2"/>
    <sin uid="s1" name="Pat Roe" kind="fake" rating="3"><licence name="Zap Gun" rating="2"/></sin>
  </build>
  <override code="skill.cap" path="skills.crb.gab">GM ok</override>
</sr6:character>
```

## Root

`metatype` and `method` repeat the build's, so a server can list runners without reading the build. `metatype=""` is a
draft with none picked yet. `finalizedAt`, `finalKarma` and `finalNuyen` are set by Finalize (the karma and nuyen left);
`campaign` is set through the server. `rev` is the server's revision counter and is left out of exports.

## Build

- `method`: `priority`, `sumtoten`, `pointbuy`, `karma` or `lifepath`. `magic`: `full`, `aspected`, `mystic-adept`,
  `adept`, `technomancer` or `mundane`; an aspected magician names its one Magic skill in `aspectedSkill`. `tradition` is
  free text; `drainAttr` is `log`, `int` or `cha`.
- Spends are counts: attribute `points` (from the attribute pool), `adjust` (adjustment points) and `karma` (ranks bought
  with karma); a skill's `points` and `karma` likewise. A missing number reads as 0.
- `<lifemodule>`: an adult life module taken (lifepath); each `<choice>` is the option picked for the module's mixed choice
  at that index: an attribute abbreviation, `skill:<id>` or `nuyen:<n>`.
- `<quality free="true">`: a metatype trait, free and not removable. `name` (on a quality, pick or purchase): the
  catalog name when it was added, shown if the entry later leaves the catalog.
- `<pick kind>`: `spells`, `rituals`, `adeptpowers`, `complexforms`, `metamagics` or `echoes`; `level` for leveled powers.
- `<purchase kind>`: `weapons`, `armor`, `augmentations`, `electronics`, `gear` or `vehicles`; `rating` for rated
  items, `grade` for augmentations, `worn` for armor. No `id`: a custom item at the player's own `cost`, `avail` and
  `essence`. Nested `<purchase>`s are accessories fitted to it. `<snapshot>` holds the catalog entry in the SR6 data
  files' own format (docs/sr6-data-format.md), without its description; Export writes it so the line still reads when
  the entry is gone.
- `<bonus target value perRating?>`: what a ware, power or item adds, entered by the player (the catalog has no bonus
  data). `target` is an attribute abbreviation or `initDice`; `perRating`: times the line's rating.
- `<sin kind="real|fake" rating?>` with its `<licence>`s.

## Reading bad files

As Anarchy's: a character XML can't hold (a control character) is refused with its line and column; **Try to repair**
removes it, escapes stray `&`, and drops any child that can't be read ("Dropped purchase 3: qty="x" isn't a number.").
An unknown `method` or `magic` is refused; repair sets `priority` or `mundane` and says so.
