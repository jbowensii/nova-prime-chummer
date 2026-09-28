# CRB recipe: layout survey

Survey of the owner's *Shadowrun Anarchy 2.0 Alternative Core Rulebook v1.8* PDF as the converter prints it (v4 for 9a; v5 from 9b).
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
3. **Letter-spaced bold** (pregen stat pages, art captions): "E SS E N C E", "W I LL P O W E R".
   Matters for the pregens (Task 9c), not spells.

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
drone variants, the deck Attack/Firewall and vehicle Flying add-ons). Pages move to the box for 10,
the two autonomous medkits are Drone Amps in v1.8, 6 entries' effects and 4 items' descriptors differ with a cause. The ids and
causes are listed in `importer/tests/test_crb.py`. v1.8 also prints 48 Amps the oracle lacks (contacts,
control rigs, eyes and ears, bone lacing, base vehicles, weapons, drugs, drones).
