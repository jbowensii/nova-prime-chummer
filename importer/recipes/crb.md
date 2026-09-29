# CRB recipe: layout survey

Survey of the owner's *Shadowrun Anarchy 2.0 Alternative Core Rulebook v1.8* PDF as the converter prints it (v4 for 9a; v5 from 9b; v6 from 9c).
Page ranges and layout only, no book text. Target list proceeds without owner sign-off (controller
ruling); the parity oracle is the acceptance target and the owner can adjust the list later.

- File: 322 PDF pages, 106 MB, SHA-256 `4ae357ad…707a95` (full hash in `crb.py`). PDF metadata has no title.
- Conversion (converter v5, `py -3.12 -m importer convert`): about 30 s wall time, 1.3 MB Markdown.
- Page numbers: two cover pages come before printed page 1, so **printed = PDF − 2**. Every page ends
  with its printed number as a bold line (`**180**`). Pages below are printed numbers (PDF in brackets
  where it helps).
- Identify: known SHA-256 → 1.0; else the head says "alternate core rulebook" and "Shadowrun" → 0.9.
  The title on p.2 comes out with doubled letters (bold drawn twice), so it is not a usable marker.

## Page shapes

- Body text: two columns, read column by column. Sidebar quotes start with `>`.
- **Rules boxes**: each box is a one-column pipe table: the header row is the box title in capitals,
  the single body cell holds the whole box, lines joined by `<br>`. A box set in two text columns
  (drugs, toxins, mentor spirits, adept powers, vehicles, drones, the Lightning example) came out
  interleaved line by line in v4; v5 reads such a cell column by column when no line crosses its gutter
  (a box with a table under the text, like the weapons table p.142, keeps its rows). Tables inside a box (spell lists,
  cost sheets) are flattened to text lines under a capitals header line ("SPELL TYPE THRESHOLD NOTES").
- A few small real tables come out as proper pipe tables (skills cheat sheets p.61-63, risk dice p.70,
  glitch examples p.74-76, character cost cheat sheet p.83, level tables p.86, NPC attribute rows
  p.244-247).
- Inside boxes, "." is often printed as U+FFFD (`�`): "p� 60", "Dis�". In titles it also stands for an
  apostrophe ("CON ARTIST�S").

## Converter problems and how the recipe handles them

1. **Margin tab letters.** Each chapter's outer margin carries its title spelled vertically
   (Awakened World: A W A K E N E D / W O r L d; the pregens chapter: P r E G E N S). The letters come
   out as lone one-letter lines, or glued to a line's start ("d Acid stream*", "W Mask …") or end
   ("… Hits r"), and sometimes inside a box title ("| d COUNTERSPELLING |", "| d SIN AND LICENSES |").
   The recipe strips them: drop lone letters of the chapter's tab set; strip a glued letter at a line's
   end, and at its start (the letter "A" only before `*`, `(`, `+`, `•`, since "A" starts sentences);
   allow an optional tab letter before a box title. The converter stays book-agnostic (Task 2 ruling).
2. **Page art read as tables.** Weapon art captions (p.145-147 [PDF 147-149]), vehicle art
   (p.235-236, p.240) and the running header on p.238 come out as pipe tables with letter-spaced
   bold cells ("**T y p i c a l**"). The recipe only reads boxes it recognises by title, so these are
   treated as prose and ignored. p.145 in particular is prose, not a table.
3. **Letter-spaced text** (pregen stat pages, art captions): "E SS E N C E", "W I LL P O W E R", keywords and cues
   one letter a word. The stat pages' lines are set with a slight tilt, so each letter measured a few hundredths of a
   point apart in size and pdfplumber split every letter off. Converter v6 treats such size noise on tilted lines as
   one size (other books convert byte-identical, except a rotated name in the pregen booklet). The small caps still
   come out in mixed case ("grumPy OLd mAn"); the recipe lower-cases them.

## Target chapters

| Target | Printed pages | Layout |
|---|---|---|
| Spells | 180-183 (boxes); prose 178-184 | Five boxes "COMBAT / DETECTION / HEALTH / ILLUSION / MANIPULATION SPELLS" (Health and Illusion share p.182). After the header line each row is "Name Family (subtype, I/S) threshold notes"; a long name wraps onto the row's second line; the combat box groups names "A / B / C*" down the lines sharing one row. Footnote lines start with `*` or `**Size-based`/`**Area-based threshold:**`. Done in 9a. |
| Shadow Amp rules and effects | 58-63 | Boxes "NARRATIVE EFFECTS" (59), "ESSENCE" (60), "SHADOW AMP BASE RATING" and the 4-column "SHADOW AMP EFFECTS" table (61-63, continued). Mechanics already shipped; no named amps here. |
| Mentor spirits (qualities) | 174-175 | Box "FOLLOWING A MENTOR SPIRIT" (174); the mentor list on 175 is prose in two columns with bold names. |
| Equipment selections | 136, 139 | Boxes "INFILTRATION GEAR SELECTION", "CON ARTIST'S EQUIPMENT SELECTION": bold "**Name:** (equipment, cost) text" entries. |
| Weapons | 142-144 | Box "WEAPONS" (142: base DV/range table flattened, header "CLOSE SHORT MEDIUM LONG"); "WEAPON AMPS" (144): "**Name:** (weapon type, Rating N Equipment Amp, cost¥) DV n; range [a/b/c/d]; effects". Art tables 145-147. |
| Armor | 148-149 | Boxes "ARMOR" (header "ARMOR RATING"), "ARMOR AMPS". |
| Drugs, toxins | 150-152 | Boxes "DRUGS", "TOXINS", "GAS GRENADES EXAMPLE". |
| Cyberware | 155-158 | Boxes "DNI & EQUIPMENT IMPLANTATION", "HEADWARE" (155), "EYEWARE" (156), "EARWARE" (157), "BODYWARE" (158): "**Name:** (Rating N Cyberware Amp, Essence x, cost¥) effects". |
| Bioware | 159 | Box "BIOWARE", same entry shape. |
| Medkits and patches | 160 | Box "MEDKITS AND PATCHES". |
| Contacts, SIN, lifestyle | 162-166 | Boxes "SIN AND LICENSES" (tab letter glued in title), "NETWORK", "CONTACTS" (164), "LIFESTYLE" (166). |
| Foci | 189 | Box "FOCI" (equipment amps). |
| Adept powers | 191 | Box "ADEPT POWERS": bold-name entries. |
| Cyberdecks and programs | 210 | Box "CYBERDECKS AND PROGRAMS". |
| RCC, vehicles, drones | 232, 234-238, 241 | Box "RIGGER COMMAND CONSOLE" (232); vehicle selection prose 234-237 with art tables; box "VEHICLES" (238, preceded by two header-art tables); box "DRONES" (241). |
| NPC vehicles | 247-249 | NPC stat blocks (5-column attribute tables); the oracle cites two vehicles on p.249. |
| Character creation example (Lightning) | 85 | Box "CHARACTER CREATION EXAMPLE" (PDF 87), one body cell. |
| Optional rules | 68, 80, 139 | The Table rules' seeds, names and pages only (descriptions to the texts): the vehicle and drone damage note on p.68 is body prose with its "**Note:**" label on a line of its own; the box "PLANNING POOL" (p.80, first line "OR PERSONAL EDGE?"); the box "OPTIONAL RULES:" (p.139, first line "EXTENDED SOCIAL TESTS"). A rule not found keeps its known page and gets no text. |
| Pregens | 87-111 | Chapter opener 87; 12 runners, two pages each: story page (even, 88-110: letter-cased name line, bold role line, prose) and stat page (odd, 89-111): letter-spaced attribute labels with values detached, "SKILLS RATING +ATT. = DP RR" block where some skill rows come out as 4-column pipe tables, then SHADOW AMPS / WEAPONS / EQUIPMENT / WOUNDS / KEYWORDS / DISPOSITIONS / CUES blocks, letter-spaced. Order: Hercules, Wild Jane, Trash, Gambit, Charon, Luna, Casper, Echo, Drakk, White_Rabbit, Mictlan, Capitán. |

## Spells parity (9a)

Against the 33 `source="CRB"` spells in the oracle: all 33 ids found, kind/category/source equal.
Differences, each with its cause:

- Page: Increase Reflexes 179 → 182, Heal 184 → 182, Control Thoughts 184 → 183. The old catalog cited a
  prose mention; the recipe cites the spell box.
- Name: Magic fingers → Magic Fingers (the box's capitalisation).
- Extra: Elemental Aura (manipulation, 183). CRB v1.8 prints it in the box; the old catalog listed it
  as DHSA only.

## Amps and gear parity (9b)

Entries are the boxes' bold run-in names with a "(…Rating N <Kind> Amp…)" or "(Equipment, cost)" paren, pp.136-241
(plus two substances the toxins box rules "always equipment", and the deck add-ons "(…, Amp Rating +1)").
Margin tabs per chapter: Mundane World pp.133-167, Awakened World 169-199, Virtual World 202-228,
Mechanical World 230-242.

Against the oracle's 148 source="CRB" amps and 13 gear items (the old catalog's DHSA rows printed in black):
141 amps and all 13 gear items found, every printed rating equal. 27 are renamed (25 amps + 2 gear; v1.8 prints the model name
without DHSA's added type, or a different name), 7 aren't in any v1.8 box (Concealment, the three flying
drone variants, the deck Attack/Firewall and vehicle Flying add-ons). Concealment is printed on the Hercules pregen
sheet (p.88) and comes from there (F1, below). The other 6 aren't rulebook entries (owner's rule: they stay non-canon
DHSA entries): the flying drones are the DRONES box's base micro/small/medium drones (p.241), which print
"Speed N (flying M)"; the flying names only describe NPCs' drones. The add-ons are rows of the SHADOW AMP EFFECTS table
(pp.61-63). Pages move to the box for 10,
the two autonomous medkits are Drone Amps in v1.8, 6 entries' effects and 4 items' descriptors differ with a cause. The ids and
causes are listed in `importer/tests/test_crb.py`. v1.8's boxes also print 48 Amps the oracle lacks (contacts,
control rigs, eyes and ears, bone lacing, base vehicles, weapons, drugs, drones).

**Sheet-only amps (F1).** An amp on a pregen sheet or in the Lightning example whose type and name no box amp has
(exact, unique prefix as `statblock.catalog_id` matches, or the same words in any order and number) is a catalog amp
too: source CRB, the sheet's page and printed rating, the sample runner's effects (narrative effects without the line
text), the sheet's lines in the texts only; an equipment amp named after a sheet weapon gets it as its weapon item.
The Awakened amp, contacts (named people of the runner's story) and metatype traits are skipped. 23 in v1.8:
Concealment plus 22 (adept 2, cyberdeck 1, cyberware 5, equipment 5, quality 4, vehicle 5); names in the F1 report.
Luna's tattoo focus prints 13 for effects worth 10 (a rating-mismatch row).
Some sheet-only amps sit close to a box amp but stay separate entries, because the name or rating differs and the match
is by name: Damaged MCT Gnat (vehicle 2; the box's MCT Gnat is 4), Wired Reflexes (cyberware 6; the box has Ares wired
reflexes 6 and Evo wired reflexes 8), Roto-drone (vehicle 2; MCT-Nissan Roto-drone 5), Counterfeit datajack (cyberware 2;
Datajack 2, Unlocked Datajack 4). Merging any of them would be a judgement about the book, not a name match.

## Sample runners (9c)

- **Pregens** pp.88-111: story page (even; name in small caps, role in bold on one or two lines), stat page (odd)
  read by `statblock.crb_statblock`: attribute labels stacked with the values detached (the first two values sit on
  the AGILITY and STRENGTH lines; order EDGE, CHA, LOG, WIL, AGI, STR), skill rows plain or as 4-cell pipe rows,
  "LOG/AGI 9/11" for a spec with two attributes, "KNOWLEDGE SKILLS", amps "**Name (type)** [Essence] Rating" with
  one effect a line, weapons and spells in one list ("… Weapon" / "… Spell"), equipment and threshold rows on shared
  lines, small-caps keywords, dispositions and cues (their line breaks don't always follow the items: a wrapped
  disposition comes out as two, and cues are split at sentence ends).
- **Lightning** p.85: the CHARACTER CREATION EXAMPLE box, prose; the GAME CONCEPTS margin tab is stripped.
- Parity with the 13 hand-encoded runners: derive() gives the same attributes, pools, thresholds and Essence for all
  13; every printed amp rating equals the engine's (Hercules' and Echo's Well-Stocked Closet included: the Armor 1
  line stays text, so the rating is the printed 2 and the armor point sits on the Clothes item); every printed pool,
  threshold and Essence the oracle lists is reproduced. Two printed pools roll with an attribute the rules don't
  give that pool (status "attribute", not tested): Casper's Network (medical) WIL, Mictlan's Stealth (lockpicking) LOG.

## Core files (Task 1 of 0.4.0)

`crb_core.py` reads the rules engine's core files from the book; the owner's local copies (public/data, gitignored) are
the answer key (`importer/tests/test_crb_core.py`, equal but for the pages listed there). Where each table is:

- Attributes p.52 ("Strength (STR/S) is …"), the metatype table p.52 (rows plain or as pipe rows, the GAME CONCEPTS tab
  letters glued to the row starts), Racial Qualities pp.50-51 under each metatype heading.
- Skills: names, specializations and their attribute letters from the SKILLS, SPECIALIZATIONS, AND RELATED ATTRIBUTES box
  (p.54); linked attributes (first = attr, last = alt; Engineering prints its value before the label) and "Only … can use
  this Skill" from each Skill's section (pp.53-57), cited to the heading's page.
- Amp types pp.58-60: a heading in capitals, then "**Base rating N[ then M][, Essence -x]**". The Awakened options are
  the "• **Name:** rating +N" bullets on p.58.
- SHADOW AMP EFFECTS pp.61-63: sections as pipe rows ("Magical", "Matrix", the vehicle rows) or with their columns come
  apart ("Physical", "Virtual reality", "Rigging", "Miscellaneous": the names first, then "+N types" lines in the same
  order, the Reference column's "Title (p. N)" mixed in; "Adept" and "powers" can be split by it).
- Vehicles p.60 (bullets; the Large drone's continues after the ESSENCE box and the page number), cost cheat sheet p.83
  (label, then cost lines), levels pp.84-85, the three package tables p.86 (a row's cells split over lines), the WEAPONS
  box p.142 (examples or DV wrap; "**" specialist, "*" toxins), the ARMOR box p.148, the LIFESTYLE box p.166.

Named exceptions (values the recipe keeps in code, with the owner's rules for them):
- `mental-armor`: priced from the Astral Armor power (its rating less the adept base, p.190) with Armor +1's max and types;
  cyberdecks may take it too (biofeedback, p.211) — that last part is the app's.
- `init-realm`: read from the initiative rows' notes (the realms listed, the rating reduction per level).
- Pricing `complexForm`: the CRB has no technomancers; the recipe writes the spell price as a stand-in. The CG's import
  reads its own price ("Complex forms cost N¥", p.9) into a partial `<prices>` overlay that the loader writes over it.
- ids, effect categories and params, "once" maxima for on/off effects, weapon groups, and dropping the "Unarmed" weapon row.
- `cg.py` TASKING_SPECS and TASKING_ATTR: the Conversion Guide's Tasking specializations, kept as vocabulary.

The other recipes and the importer read every rule value (effect ratings, amp type bases, chassis, pilot, weapon DVs and
ranges, amp and specialist-weapon prices) from the core files at import time; a book imported before the core data fails
with "There is no core data yet".
