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

Source DHSA = Daegann addition (page = DHSA page). CRB = core-book entry, as
reproduced in DHSA.

| amp | source | type | printed | computed | why |
|---|---|---|---|---|---|
| first-impression | DHSA p.5 | quality | 4 | 5 | situational RR priced as a specialization |
| hotshot-pilot | DHSA p.6 | quality | 1 | 2 | situational RR priced as a specialization |
| online-reputation | DHSA p.6 | quality | 4 | 5 | situational RR priced as a specialization |
| monofilament-whip | CRB p.8 | equipment | 1 | 2 | DV 7 vs advanced close-quarter 5 = +2 DV, printed rating 1 |
| sawn-off-defiance-t-250-shotgun | DHSA p.10 | equipment | 1 | 2 | range change priced at +1 instead of +2 |
| m79b1-rocket-launchers | DHSA p.11 | equipment | 1 | 2 | range change priced at +1 instead of +2 |
| eastern-tiger-gwishin | DHSA p.20 | cyberdeck | 10 | 11 | DHSA priced below the effect table |
| dassault-milrig-vcr | CRB p.29 | cyberware | 9 | 11 | VCR + hot-sim + vehicle initiative priced below the effect table |
| phoenix-mentor-spirit-rebirth | DHSA p.35 | quality | 5 | 7 | DHSA priced below the effect table |
| missile-parry | DHSA p.46 | adept | 3 | 5 | situational RR priced as a specialization |
| seadoo-bolt-jet-ski | DHSA p.54 | vehicle | 1 | 2 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| aztech-nightrunner-boat | CRB p.54 | vehicle | 1 | 2 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| minidrone | DHSA p.55 | vehicle | 1 | 2 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| flying-minidrone | DHSA p.55 | vehicle | 2 | 3 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| horizon-flying-eye-flying-minidrone-to-rotors | DHSA p.55 | vehicle | 2 | 3 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |
| mct-hornet-flying-minidrone-winged-insectoid | DHSA p.55 | vehicle | 4 | 5 | chassis not in the CRB table (water craft, minidrone); nearest chassis used |

## Pregens (public/samples)

Filled in by Task 11. Each row is a printed amp rating that the rules can't
reproduce.

| sample | amp | printed | computed | why |
|---|---|---|---|---|
