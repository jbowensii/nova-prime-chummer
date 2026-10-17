# CL6 Class-A Decisions — 2026-10-17

Owner ruling on all 80 class-a rows from the 0.17.0 CL6 accuracy run.
Evidence gathered by single-session PDF analysis + gossipcat consensus (opus + gpt verified
each group against source PDFs / book.md; gemini relay environment lacked pymupdf).

Input files:
- `docs/reviews/cl6-arbitrated-review-2026-10-17.md` — grouped list
- `.extract/cl6out-0170/cl6-diffs.csv` — full arbitrated diff (filter class=='a')

---

## Group 1 — Hack & Slash dataterms: avail + cost missing (12 items)

**Items:** Eastern Electronics Term, Xiao Homestation, Novatech Edge, Spectrum VVX,
Leviathan Executive, Hermes Home Connect — each missing both `avail` and `cost`.

**Book evidence:** H&S p52 prints a full dataterms table with AVAIL and COST columns
(confirmed by PDF). Our importer produced empty for both fields on all 6 dataterms (12 rows).

**Root cause:** Parser missed the dataterms table entirely.

**Ruling: FIX**
Action: Extract avail and cost from the H&S dataterms table.

---

## Group 2 — Rating range missing on per-rating items (31 items)

**Items:** All per-rating items across bs, crb, fs, bn, dod, hs — BTLs, armor mods,
programs, bows/arrows, barding, Naga Venom, Single Cybereye, Personal Assistant.

**Book evidence:** Books print per-rating cost tables. CRB p272 explicitly states
"All skillsofts are available in ratings from 1 to 6." Armor mods follow the standard
1–14 capacity cap. BTLs follow the software rating 1–6 rule. Our importer stores ''
for the rating field; CL6 stores the range (e.g., '1–6', '1–14').

**Root cause:** Importer doesn't capture or store the rating range for per-rating items.

**Ruling: FIX**
Action: Add rating-range extraction pass. Most ranges are deterministic by item type:
- Software/BTLs: 1–6
- Skillsofts (Activesoft/Linguasoft): as printed in CRB table
- Armor mods: 1–14 (capacity cap)
- Barding: 1–20
- Naga Venom: 1–9
- Single Cybereye: 1–5
- Gel Weave/Reactive Armor: 1–4
- Extended Clip: 1–2
- Iron Hawk Bow/Arrows: 1–14
- Injection Arrow: 1–14
- Personal Assistant: 1–6

---

## Group 3 — Avail not printed by book; CL6 infers it (36 items)

Gossipcat consensus (2026-10-17, consensus_id: 8b50de53-47174ba9):
- opus-reviewer: read PDFs directly, ACCEPT OURS for all sub-groups, High confidence
- gpt-reviewer: read book.md files, ACCEPT OURS for all sub-groups, High confidence
- gemini-reviewer: relay env lacked pymupdf; CANNOT DETERMINE (tool failure, not a finding)

### 3A — Street Wyrd preparations (28 items, CL6 avail = 6)

**Book evidence:** SW p87 explicitly states: *"This treatment comes in the form of three
game stats: Cost, Usability, and Shelf-Life."* No AVAIL in the defined stat set. Every
preparation entry (p90–p103) prints only Formula, Drain Value, Cost. CL6's value of 6
has no printed source anywhere in the chapter.

**Ruling: ACCEPT OURS → reclassify to class-b**
Our empty avail is correct. CL6 invents this value.

### 3B — Smooth Operations preparations (3 items, CL6 avail = 6)

**Items:** Love Potion #10, No Means NO!, Fear of God!

**Book evidence:** SO p113 states these preps *"follow the rules for commercially prepared
production models (p. 69, Street Wyrd)"* — the same three-stat set. Each entry prints
only Formula, Drain Value, Cost. No AVAIL on the page.

**Ruling: ACCEPT OURS → reclassify to class-b**
Our empty avail is correct. Same design as 3A.

### 3C — DA Hurt Locker Rating 1 & 2 (2 items, CL6 avail = 2)

**Book evidence:** DA p44 states explicitly: *"These modifications aren't available in
any store, and typically only a street doc or someone with the necessary skills and
equipment can make these modifications."* The p45 enhancements table columns are
ESSENCE / CAP / COST — no AVAIL column. Hurt Locker R1 = 300¥, R2 = 500¥.
CL6's value of 2 matches nothing in the table.

**Ruling: ACCEPT OURS → reclassify to class-b**
Our empty avail is correct. The book explicitly says hotmods are not store-available.
CL6's value contradicts the rules text.

### 3D — CLN Asphyxia Spores (1 item, CL6 avail = 4)

**Book evidence:** CLN p38 stat block has Vector / Speed / Duration / Power / Effect only.
No AVAIL. The chapter intro does say *"While each item has availability rating…"* but
never prints one for the grenades — authoring gap. CL6's 4 is the core gas grenade's
4(I) with the "(I)" stripped. The correct inherited value would be 4(I), not 4 —
CL6 lost the restriction code in the inference.

**Ruling: ACCEPT OURS → reclassify to class-b**
Our empty avail is correct. No value is printed; CL6's inference also loses the
restriction code. Note: if a future pass adds inherited avail for these grenades,
the correct value is 4(I) (from CRB gas grenade table), not bare 4.

### 3E — CRB-SEA Water-Repellent Coating (1 item, CL6 avail = 1)

**Book evidence:** CRB-SEA p335 describes this as prose only: *"any piece of armor can
have a hydrophobic polymer nano-coating applied to it for 100 nuyen."* It is not a row
in the adjacent Seattle Rain Gear table. No AVAIL is printed. CL6's value of 1 matches
the Disposable Cloak row in that table — an adjacent item, not this coating.

**Ruling: ACCEPT OURS → reclassify to class-b**
Our empty avail is correct. CL6 inherits from the wrong item.

### 3F — TS Foamtek Refill Carbine (1 item, CL6 avail = 4)

**Book evidence:** TS p147 shows the Foamtek Carbine table with AVAIL 4(L). The refill
appears only in the Notes line: *"Tank refills are 200¥ each."* No separate AVAIL.
The solvent spray on the same page explicitly states its avail ("availability of 6(I)"),
proving the author printed avail when one was intended — and deliberately did not for the
refill. CL6's 4 is the carbine's 4(L) with the legality code stripped.

**Ruling: ACCEPT OURS → reclassify to class-b**
Our empty avail is correct. CL6 inherits from the parent carbine and loses "(L)".

---

## Group 4 — Weapon Security System legality field (1 item)

**Item:** Weapon Security System (fs p65)

**Book evidence:** Book prints AVAIL = 3(L). Our `avail` field = '3(L)' ✓ (class-b,
already correct). The class-a row is the `legality` field — our importer stored '3(L)'
(the full avail string) in both the avail and legality fields. CL6's legality = '(legal)'
(correctly extracted just the restriction).

**Root cause:** Legality field is not parsed separately from avail; importer copies the
full avail string into both fields.

**Ruling: FIX**
Action: Extract restriction code separately. Legality field should store just the
restriction ('L' / 'R' / etc.), not the full avail string.

---

## Summary

| Group | Items | Ruling | Action |
|-------|-------|--------|--------|
| 1 — HS dataterms avail+cost | 12 | FIX | Extract from H&S p52 table |
| 2 — Rating range missing | 31 | FIX | Add per-item rating-range extraction |
| 3A — SW preparations avail | 28 | ACCEPT OURS | Reclassify → class-b |
| 3B — SO preparations avail | 3 | ACCEPT OURS | Reclassify → class-b |
| 3C — DA Hurt Locker avail | 2 | ACCEPT OURS | Reclassify → class-b |
| 3D — CLN Asphyxia Spores avail | 1 | ACCEPT OURS | Reclassify → class-b |
| 3E — CRB-SEA Water-Repellent Coating avail | 1 | ACCEPT OURS | Reclassify → class-b |
| 3F — TS Foamtek Refill avail | 1 | ACCEPT OURS | Reclassify → class-b |
| 4 — WSS legality field | 1 | FIX | Extract restriction code separately |
| **Total** | **80** | | |

**Real importer bugs to fix: 44** (Groups 1 + 2 + 4)  
**Reclassify to class-b: 36** (Group 3, all sub-groups — book does not print avail; CL6 infers)

After fixes + reclassification: class-a count → 0. Accuracy target achieved.
