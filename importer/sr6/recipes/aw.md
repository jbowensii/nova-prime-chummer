# SR6 Astral Ways (AW): layout survey

Structure only, no book text. The owner's PDF (SHA-256 in `aw.py`): 186 pages, printed page = PDF page − 1
(`PAGE_OFFSET`). From PDF page 184 on: the index (`END_PAGE`, left out). A setting book: each metaplane's chapter
ends in a level-2 Game Information section (the rules), TECHNIQUES OF TRAVEL is all rules, the rest is setting (left
out: `RULE_PARTS`, `RULE_BOOK_CHAPTERS`).

## Item shapes

- Beings: a level-4 heading, a tag line (`(Fire, Force 4)`, `(Force 7 Spirit of Beasts, Great Form)`,
  `(Professional Rating 5)`), the description, then a level-5 box (often titled in lower case, sometimes in the plural)
  with the band (`B A R S W L I C M ESS` and `AC CM MOVE` or `DR I/ID AC CM MOVE` tables, or the attributes as a bold
  header over a value line) and labelled lines. The box takes the heading's name, tag and text. A Force tag is a
  spirit (category: the element, else the kind after the Force: spirit-of-beasts, toxic-kin-spirit), a Professional
  Rating tag an NPC (group: its level-3 section), no tag a critter (category: the chapter, i.e. its metaplane:
  chimeras, golems, toxic horrors). A tagged being with no band (the Pterosaur's prints inside the Ceratops' box) and a
  band whose headers run together (the Tandoran metatype's ranges) are reported (missing-value).
- Catalog tables (first header TYPE or WEAPON: `NAME_HEADERS`): the airships (vehicles; no pilot or sensor printed),
  their weapons and bolts (weapons; SKILL to the text), the astral devices (shadow cloak, sextant, maps, amulets:
  gear; FORCE is the rating, BONDING COST the karma), the encounter suits (armor). The Crimson Carnage Harley's box
  prints its table in its text, with no price.
- Magic: the spell (a `(Manipulation Spell)` tag and a RANGE TYPE DURATION DV box), the rituals (a heading ending in
  Ritual with an `(Anchored)` tag and a Threshold label), the critter power (a `… Critter Power` heading whose TYPE
  ACTION RANGE DURATION row reads as a catalog row: named by the heading without `Critter Power`), the metamagic
  (`New Metamagic: X` over a `Prerequisite: …` heading) and the quality (`Negative Metagenetic Quality: X` with a
  Bonus label).
- New edge action, contact type, true elements, Miggon mutations, metaplane generator: rule sections.

## Formula styles and issues (importer v2)

- Foci `Force x N¥` (and their bonding Karma) -> `R*N`; ammunition `+100%` -> `B*2` (twice the base round).
  (`<formula>` and `<issue>`: docs/sr6-data-format.md, `importer/sr6/formula.py`; the printed attribute stays as printed.)
- Issues: the airship weapon table has no MODE or AMMO column: each ranged weapon gets `missing` modes and ammo.

## Table shapes and value styles (importer v2)

- **Two fields in one cell.** Airship weapons print the blast in the DV cell (`8P(10m blast)`): `dv` and `blast`.

## Real-book check (local, nothing committed)

    python -m importer sr6 check "<Shadowrun 6e-Astral Ways-Setting Book-CAT28101.pdf>" --out "%TEMP%\aw-check"
