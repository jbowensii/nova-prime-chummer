# Book discrepancies

Where the numbers printed in the books disagree with the rules as the engine
applies them. We follow the rules and record the disagreement here, instead
of bending the engine to match a printed number.

## Catalog amps (amps.xml)

`tools/dhsa_to_xml.py` breaks every amp in Daegann's list into rule effects
and compares the result to the printed rating:

- **Computed below printed:** the difference is filled with *Additional
  narrative effect* (+1, CRB p.63) and tagged `note="balances printed rating"`.
  The book assigns narrative effects loosely, so this keeps catalog prices true
  to the book.
- **Computed above printed, where the text lists a drawback** ("Disadvantage
  when it wears off", "must take High Risk"): the difference becomes a
  *Negative effect* tagged `note="book drawback"`. It is book-sanctioned, so it
  needs no GM approval while it matches the catalog entry.
- **Computed above printed with no drawback text:** listed below. The amp
  keeps its computed rating and pays the rules price.

Source CRB = core-book entry, cited to its core-book page. DHSA = Daegann's
Holostreets Shadow Amps Expanded List v3.4b, cited to its own page.

| amp | source | type | printed | computed | why |
|---|---|---|---|---|---|
| first-impression | DHSA p.5 | quality | 4 | 5 | situational RR priced below the effect table |
| hotshot-pilot | DHSA p.6 | quality | 1 | 2 | situational RR priced below the effect table |
| online-reputation | DHSA p.6 | quality | 4 | 5 | situational RR priced below the effect table |
| monofilament-whip | CRB p.144 | equipment | 1 | 2 | DV 7 vs advanced close-quarter 5 = +2 DV, printed rating 1 |
| sawn-off-defiance-t-250-shotgun | DHSA p.10 | equipment | 1 | 2 | range change priced at +1 instead of +2 |
| m79b1-rocket-launchers | DHSA p.11 | equipment | 1 | 2 | range change priced at +1 instead of +2 |
| mod-evasion | DHSA p.19 | mod (cyberdeck) | 3 | 4 | situational RR priced below the effect table |
| mod-ice-pick | DHSA p.19 | mod (cyberdeck) | 3 | 4 | situational RR priced below the effect table |
| eastern-tiger-gwishin | DHSA p.20 | cyberdeck | 10 | 11 | situational RR priced below the effect table |
| drone-whisperer | DHSA p.24 | equipment | 1 | 2 | situational RR priced below the effect table |
| logic-virus | DHSA p.24 | equipment | 3 | 4 | situational RR priced below the effect table |
| phoenix-mentor-spirit-rebirth | DHSA p.35 | quality | 5 | 7 | DHSA prices the two RR picks at +1 each instead of +2 |
| azaca-younger-brother-of-the-loas | DHSA p.37 | quality | 2 | 4 | DHSA prices the two RR picks at +1 each instead of +2 |
| erzullie-loa-of-love-and-passion | DHSA p.37 | quality | 2 | 4 | DHSA prices the two RR picks at +1 each instead of +2 |
| missile-parry | DHSA p.47 | adept | 3 | 5 | situational RR priced below the effect table |
| seadoo-bolt-jet-ski | DHSA p.55 | vehicle | 1 | 2 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| aztech-nightrunner-boat | DHSA p.55 | vehicle | 1 | 2 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| minidrone | DHSA p.56 | vehicle | 1 | 2 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| flying-minidrone | DHSA p.56 | vehicle | 2 | 3 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| horizon-flying-eye-flying-minidrone-rotors | DHSA p.56 | vehicle | 2 | 3 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| mct-hornet-flying-minidrone-winged-insectoid | DHSA p.56 | vehicle | 4 | 5 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |

## Pregens (public/samples)

Filled in by Task 11. Each row is a printed amp rating that the rules can't
reproduce.

| sample | amp | printed | computed | why |
|---|---|---|---|---|
| hercules | amp-2 | 2 | 3 | Well-Stocked Closet: equipment 0 + Armor +1 (1) + RR 1 Influence (etiquette) (2) = 3. DHSA lists the same amp at 2 *without* the Armor +1, so the pregen gets the armor point free. |
| echo | amp-3 | 2 | 3 | Same Well-Stocked Closet as Hercules. |

## Pregen totals

Priced by the engine at Runner level (budget 375,000¥): Wild Jane, Trash,
Gambit, Charon, Luna, Casper, Drakk, White_Rabbit and Mictlan come to
**exactly 375,000¥**. Hercules and Echo are 380,000¥, which is exactly the
free Armor point on their Well-Stocked Closet (1 rating × 5,000¥). Capitán is
372,500¥, 2,500¥ under: one piece of gear, specialization or knowledge skill
the book doesn't list.

## Effect-table exceptions the book makes

The effect table (CRB p.61) limits initiative enhancements to Qualities,
cyberware/bioware and adept powers, but the combat drugs (Jazz, Cram,
Kamikaze, Nitro) are Equipment amps that grant initiative. Effects carried
by a catalog amp exactly as the book prints them are treated as
book-sanctioned; the same effects on a home-made amp are flagged.
