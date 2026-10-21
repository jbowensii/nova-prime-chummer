# Release notes

## 0.17.0 — 2026-10-16

Shadowrun 6 gets a vehicle, drone and critter builder, playable Infected characters, per-SIN licences, and data much closer to Commlink6.

**Admins, after updating:**
- **Books → Re-import all** to get the new data (Double Clutch design tables, Wild Life critter tables, the Infected rules,
  the core rulebook's Current Printing handling). Nothing else needs a re-import.
- The Docker image is no longer also published under the old `chummer-anarchy2` name.

**Shadowrun 6**
- **Vehicles and drones**: separate Vehicles and Drones tabs, owned vehicles' and drones' modifications, mounts and
  autosofts, and a Designer section to design your own (stored by the server, GM approval, bought from Vehicles, Drones or
  the Ledger).
- **Critters**: a runner can own critters (Critters tab, training and special training priced from Wild Life, career Ledger
  spends, shown on every sheet style), and the GM has a critter editor in NPCs & Critters.
- **Foundry**: vehicles, drones and critters export as Eden Vehicle and Critter actors.
- **GM review**: runner problems show on the campaign page and as a banner on the runner; Approved by GM is a checkbox.
- **Infected** (Sixth World Companion, off by default behind a setting): each Infected quality's rules are data, an Infected
  runner is playable, and a metavariant uses its parent metatype. The Awakened flag is derived (with why) and can be overridden.
- **Licences** belong to one SIN; an owned item whose Availability prints a fee shows as licensed, with a non-blocking
  heads-up and never enforced. Stolen Gear works as the No Future errata has it.
- Every printed sheet style shows the same data, including a weapon's bonus damage.
- Name and import fixes: sub-row parent names, cost-in-avail critter cyberlimbs, P-ICE prices, import artifacts, and
  several multi-record items split per printed value (Swindler Stick, Manadyne, skates).

**Data quality (Commlink6 parity)**
- The core rulebook's Current Printing outranks the City Editions; older printings only fill gaps and keep ids stable.
- No Future's errata wins over older values; Smooth Operations clothing imports as armor; owner-ruled values (Hack & Slash
  cyberdeck cases and others) are applied.
- Override rows can split one printed row into one item per part, and never write an attribute a kind's schema lacks.
- Completeness against Commlink6 is 100%, with 99.93% accuracy on printed values.

## 0.16.0 — 2026-10-14

Shadowrun 6 data gets closer to Commlink6, the system of record, and three new rule options arrive.

**Admins, after updating:**
- **Books → Re-import all** to get the new data (item structure, the Deadly Arts rocket and missile table's range, pilot and
  sensor, and the Commlink6-only entries below). Nothing else needs a re-import.
- Table setup has a **Rule preset** menu. It fills the form for you to review; nothing changes until you Save.

**Shadowrun 6**
- **Rule presets**: Standard, Standard (Seattle), Shadowrun Missions and Configurable. Standard puts the preset settings
  back to the shipped values, so Standard creation is unchanged.
- **Creation methods can be limited** (a house rule, off by default): tick the methods a table allows. Missions allows
  priority, sum-to-ten and point buy.
- **Transhumanism** (Sixth World Companion p. 146, an option, off by default): a mundane runner buys transhumanist grades
  for the initiation price in Karma (up to 20), each an Essence hole of 1.0 that augmentations' Essence is paid from first.
  Review flags a grade with the rule off or for an awakened runner; the creation grade caps cover it (Missions: 1).
- **Item structure** from Commlink6 is in the data: the slots an item offers or fits, its variants, relevance topics, flags,
  add-on only, a weapon's size and ammunition class. The pickers and the Foundry export can use them; no rule reads them
  yet, so no character changes. Commlink6's own modifications, prerequisites and picks are kept beside our effects and never applied.
- **Rockets and missiles** keep their range, pilot and sensor on the gear row (Deadly Arts p. 58).
- Commlink6's option rows and a few records the books only mention (adapters, M-TOC Fob, AR Interface, Mil-Spec Weapon Mount,
  firing-mode, range, energy and crew-served rows, three German-named ammunition records) are entries now.
- Where the PDF's own text prints our value, ours stays; Commlink6's value is used where the book is silent, unreadable or
  prints neither (about 110 values and the structure above).

**Behind the scenes**
- `cl6check` counts 100% of Commlink6's 4,476 records, with 98.8% of matched records equal field for field once printed
  differences are counted as such (93.1% strictly). Retired ("Depreciated") records are left out, except the Weapon Security System Explosive.
- A weapon entry may carry `per` (ammunition priced per N rounds); a program may be add-on only.

## 0.15.0 — 2026-10-12

A release of fixes from a full review of the app, plus a few look-and-feel improvements.

**Admins, after updating:**
- **Shadowrun 6 sample runners may change after Books → Re-import all.** The importer now counts a mystic adept's or
  an augmented magician's free spells the way the app does (see below), so a sample runner of that kind may be fitted
  to a slightly different build. Nothing else needs a re-import, and your books are not converted again.
- **Sign in with Authelia is limited to 10 tries a minute from one network.** Past that, the sign-in page says to wait a
  minute. Normal use never gets near it.
- The README is rewritten: what the app does, how data comes in, installing and the options. Proxy and Authelia
  setup moved to its own page, [docs/hosting-auth.md](docs/hosting-auth.md).

**Both games**
- **Match my system**: a new theme choice that follows your device's light or dark setting. It is the default for a
  new browser; a light or dark choice you already saved stays.
- **Phones**: the header's icon menu wraps into an even grid, with no single icon left alone on a row.
- **Sign-in**: a sign-in link with an odd value in it shows the usual "didn't work" message instead of a blank page,
  and too many tries from one network now says so plainly.
- **Safer runner files**: a hand-edited file with a negative quantity, rating or Karma spend no longer turns a cost
  into a refund (Review flags it as an error no GM can approve); a rating range past 100 is read as unrated instead
  of slowing or crashing the page; a Shadowrun 6 entry saves without stray attributes that kept it from reading back.
- A data pack can't be made while a backup is running.

**Shadowrun 6**
- **Table setup**: the tools are laid out cleanly, and New runner says briefly why the Karma build is off.
- **Mystic adepts and Essence loss**: free spells are worked out from Magic after the Essence lost and the power
  points bought, the same in the importer as in the app.
- A life module's "Choose an Attribute: +1 to …" line now grants its one choice.
- A career level-up records each moved line once.

**Shadowrun Anarchy**
- A vehicle's Armor +1 upgrades count only up to its Body on the sheet (Review still flags the extra).
- Review's Armor +1 stacking check counts Equipment amps on the armor you wear, as the sheet does.
- A knowledge row naming an unknown slot is paid, as the sheet already said.
- Finalizing a runner a second time leaves its Karma and nuyen history alone.

**Behind the scenes**
- The two games' code is kept further apart: code both games use lives in `src/shared`, and the importer's Shadowrun 6
  steps and shared book library were separated from Anarchy's.
- Docker and CI: private local folders never go into an image build, a release image is only published from a commit
  on main that passed CI, and CI tests the importer on the image's own Python as well.

## 0.14.0 — 2026-10-12

**The app is now called Nova Prime Chummer** (it was "Chummer Anarchy 2.0"). The games keep their names, Shadowrun
Anarchy 2.0 and Shadowrun 6. Nothing about your runners, books or settings changes.

**Admins, after updating:**
- **Use the new Unraid template.** The Docker image is now `ghcr.io/jbowensii/nova-prime-chummer`. The old image,
  `ghcr.io/jbowensii/chummer-anarchy2`, is still published alongside it for now, so an existing container keeps
  working, but it will go away. Add the *nova-prime-chummer* template (it also has the `PUID`/`PGID` settings, 99 and
  100) and remove the old container.
- **The data folder moves to `/mnt/user/appdata/nova-prime-chummer`** (characters, custom and library). Stop the old
  container, move the folder, then point the new container at it (docs/deploy-tower04.md has the steps).
- Your sign-in accounts, saved runners and settings carry over untouched; the saved-file formats and the Foundry export
  format ids keep their names, so existing files still open.

**Everyone**
- The page title, the header, the printed sheets (and the dossier footer), the Settings backup and data-pack files
  (`nova-prime-chummer-backup-<date>.zip`) and the app name inside the Foundry export files say Nova Prime Chummer.

## 0.13.2 — 2026-10-12

**Admins, after updating:**
- **The container no longer runs as root.** It starts as root only to hand its data folders to `PUID`:`PGID` (default
  `99`:`100`, Unraid's nobody:users), then runs the server as that user. On tower04 the first start re-owns the
  characters, custom and library folders to 99:100, which can take a moment on a big library; later starts skip it.
  Set `PUID` and `PGID` to use another user (docs/deploy-tower04.md).
- **Re-import all the books in both games** (Books → **Re-import all**, in Shadowrun 6 and in Anarchy), so the data
  matches this release's importer.

**Both games**
- **Phones: the receipt and budgets bar is a real button.** Tap it or press Enter or Space on it to open or close the
  panel; screen readers hear whether it is open, and while it is closed nothing hidden under it takes keyboard focus.
- **Runner lists on a phone**: every row puts its buttons under the runner's name, and a long name wraps instead of
  pushing the row off the screen.
- **Screen readers**: Export, Delete, Edit and Remove buttons say which runner or entry they act on ("Delete Zip
  Spark"); the Review tab reads "Review, 2 problems"; a stepper's value says which row it belongs to; the catalog picker
  is a list of options you can move through with the arrow keys and pick with Enter or Space.
- **A tab that hits an error** shows "This tab hit an error — your saved changes are safe" and a Reload button instead of
  a blank page.
- **Names with odd characters**: a compendium, entry or edit whose name or text holds a character XML can't store (one
  pasted from a PDF) now saves as a readable file; the character is dropped.
- **Ask the rules**: when the AI provider fails, the person asking sees "the AI provider isn't answering; tell the
  admin"; the details go to the server log (AI settings' Test still shows them to the admin).
- **Security**: a hostile shared compendium can no longer stall the server; guesses at a password sent all at once count
  against the lockout before they are checked; a password change or an Authelia sign-in checks the account again just
  before it lands; a runner moved to another account leaves its campaign; AI provider addresses must be http or https;
  a few malformed requests get a clear error instead of a server error.

**Shadowrun 6**
- **Overspent reads plainly**: a budget past its limit says "over by 2 (of 24)" instead of "−2 left of 24", and the
  phone's closed budgets bar names the worst overspend (nuyen first, then Karma, then any other pool), not only Karma.
- **Why nuyen is over**: when the metatype size pricing house rule adds to a runner's spending, Review's nuyen message
  says how much it adds.
- **A runner file keeps only the runner's own optional rules**: a hand-edited file can't change a table-only setting
  (such as the skill cap); Review says the choice was set aside.
- **Leveled qualities and powers**: a level's effect written as "rating minus one" or as a per-level table now gives the
  right number at every level (Lucky Streak 1–3 with "R-1": 0, 1, 2).
- **Older career runners**: level-ups recorded before qualities and powers became one entry per level now open at the
  level they reached (no doubled power, no quality a level low), and lifestyle and upgrade spends in the ledger follow
  their entries' new ids. A rating or level the catalog doesn't have stays as it was, so Review still points it out.
- **Runner files**: a bonus's "minus" and per-rating table are saved, and a specialization may contain a semicolon.
- **Sample runners' fit** reads a unit price ("1,500 each") the same way the app does.
- **Sample runners follow the table's settings as the app applies them**: a level of play's priority letters and
  sum-to-ten target, street level's lower rows, a prime runner's doubled Karma and Twenty Questions' karma; a nested
  rule only counts while the rule it belongs to is on.
- **The same book imports the same way every time**: a table holding weapons and gear (Mil-Spec in Bestial Nature,
  Deadly Arts, Firing Squad, Age of Rust) no longer gives its categories in a different order from one import to the
  next.

**Under the hood**
- **Review fixes**: the security, accessibility and runner-file fixes above came from a full review of 0.13.1.
- **More tests**: new tests cover the importer's corners (effects, formulas, fit, edits, categories), the SR6 budgets,
  loader, data view and export, the sample fixes, and Anarchy's catalog loader, compendiums and sheet. The importer's
  sample-runner pricing is checked against the app's budgets.
- **Lint and formatting**: ESLint 9 (TypeScript and React hooks rules) and Prettier, with `npm run lint` and
  `npm run format`; the code was formatted once, and CI checks both. The findings were fixed rather than the rules
  turned off.
- **Server cleanup**: books.mjs is split into focused modules; the runner index and gzip caches forget deleted and
  changed files and stay within a size cap; a compendium list reads campaigns.xml once.
- **Importer cleanup**: the shared SR6 catalog reading, the in-book search and the table shapes have their own modules,
  and the PDF conversion is split by step; recipes no longer reach into each other's private helpers; sample runners
  are priced against the app's budgets (a parity test); the Python packages are locked with hashes.
- **Container cleanup**: the server runs as a non-root user (`PUID`/`PGID`), and every GitHub Action is pinned to a
  commit.
- **App cleanup**: the SR6 budgets are split into smaller modules, and there are no import cycles left in the app (a
  test keeps it that way).

## 0.13.1 — 2026-10-11

**Admins, after updating:**
- **Re-import all the books in both games** (Books → **Re-import all**, in Shadowrun 6 and in Anarchy): the Shadowrun 6
  books for the Commlink6 gap fixes and the sample runners' new fit; Anarchy's so both games' data match this release.
- **To give Shadowrun 6 its own AI**, open SR6 Books → **AI settings** and set its provider and its own key there; with
  AnythingLLM, use a workspace that holds only the Shadowrun 6 books. Anarchy's AI settings and keys stay as they were and
  keep working; nothing is copied over from Anarchy's, as the two games never share books.

**Both games**
- **Faster pages**: the catalog's data files are fetched all at once instead of one after another; the server lets the
  browser reuse a file it already has while it is unchanged, gzips text, and keeps each character file's read until the
  file changes, so the runner and NPC lists and every save are quicker; searches no longer redo work on every keystroke.
- **Each game has its own AI**: its own AI settings page (provider, model, key, AnythingLLM workspace), its own data to
  answer from and its own prompt. Anarchy's AI never sees the Shadowrun 6 books, and SR6's never sees Anarchy's. Who may
  set it up (the admin) and who may ask (anyone signed in) are as before; the daily question limit counts both games
  together. Backups treat SR6's key as they do Anarchy's (only with "Include my API keys").
- **AI search on Rules and Game data**: once a game's AI is set up, a plain-words search box on its Rules page (the rules
  only; each find links to its rule) and on Game data (each find looks the entry up in the catalog).
- **Export book data for Foundry** is in the header of every page for those who may export (admin and editors, GMs in
  Shadowrun 6), not only on Game data, and Game data has an **Export to Foundry VTT** button at the top. Both open the
  export, unfolded: `#/data/foundry`, `#/sr6/data/foundry`.
- **Foundry export file names**: one runner or NPC downloads as `<street name>-<date>`; several together as
  `runners-<count>-<date>`, so downloads are easy to tell apart.
- **Sheet background art shows through**: the white veil over a sheet's background picture is half as strong; the paper
  behind the text stays.

**Shadowrun 6**
- **Creation rules, tidied** (Table setup, a campaign's own settings, a runner's Creation rules panel): the one long table
  is nine foldable sections: Budgets & priorities; Attributes & skills; Qualities; Magic & Resonance; Gear & augmentations;
  Contacts & lifestyle; Levels of play; Optional rules (book); House rules. A closed section draws nothing, so the page opens
  fast; **Open all sections** and **Close all sections**, and a search box that finds a setting by name and opens its
  section. Every on/off rule is a real switch with its label (no more Not set / Yes / No); a number that needs a switch sits
  indented under it, greyed with "needs …" while the switch is off, and keeps its stored value. A value at the standard is
  grey; a changed one stands out with the standard (and its page) beside it; **Reset** per value, **Reset section** and
  **Reset all to standard**. Each row has a short name, the plain-English hover text, and its book and page. Every setting,
  its stored key and what it does are as before; a switch stores `true`, or `false` where the standard has the setting.
  A runner's panel groups the same way; its switch follows the table's value until the runner chooses its own.
- **The Karma build option ships with Commlink6's default numbers** (owner's one-off exception, 2026-10-11). No SR6 book
  prints a Karma build, so it stays an option, off (Table setup → Budgets & priorities → Karma build); turned on, it starts
  from 1000 Karma (800 with the Companion's street level, 1200 with its elite level), Magic or Resonance at 1, and Karma to
  be a full magician 60, an aspected magician 45, a mystic adept 75, an adept 45 or a technomancer 45. Its prices are the
  Karma prices already there (5 times the new rating for an attribute or skill rank, 5 a specialization, 3 a knowledge or
  language rank, 5 a spell or complex form; 2,000 nuyen a Karma). New: `karmaBuild.freeSpellsPerMagic` and
  `karmaBuild.freeFormsPerResonance` (0: every spell and complex form costs its Karma, and the Magic tab no longer shows a
  Karma-build runner's spells in red), and the two levels' starting Karma. Each number's hover text says no SR6 book prints
  a Karma build and gives its source as "option (Commlink6 defaults)".
- **Ask the rules**: the **?** button in the header and the bar on a campaign's page, answering from the Shadowrun 6 books
  only and citing book and page, in SR6's look and words.
- **Commlink6 gaps closed**: the effects reader now reads per-rating tables under an entry, a clause's own "per level"
  wording, formulas over the character's values, run-in rows and "same as" links between versions; items whose stat line
  sits in their own heading, variant tables (Stakes), stacked one-row tables (Silver Arrows, Silver Bolts) and propulsion
  versions are now catalog items; spells carry every feature tag the book gives them. Against Commlink6, effects that
  agree went from 75.8% to 83.2% and missing items from 42 to 26.
- **Sample runners**: the priority fit now prices a troll- or dwarf-sized runner's gear as the app does (metatype size
  pricing, on by default), so the troll samples no longer read as overspent; and a book whose samples name something a
  later import brings is read again once, so the samples come out the same whatever order the books were imported in
  (a full import of every book takes longer: about 850 s instead of 515 s).
- **Your runners**: each row has its own **Export for Foundry** button, as the NPC rows do.
- **NPCs & Critters**: a **Professional Rating** picker beside the search (All, then the ratings the grunts have) and
  grunts always listed first, in other accounts' lists too.
- **Quicker editor and pages**: a closed catalog picker works nothing out, the books' texts are read without the browser's
  XML parser, and Game data, Table setup and Rules work out their lists once per catalog instead of on every change.

**Anarchy**
- **Sheets**: two sheet ink colours are a shade darker so text over the background art stays easy to read now that the
  art shows through more.

## 0.13.0 — 2026-10-11: the books' rules as switches, effects round three, one catalog item per level in both games

**Re-import the books of both games** (Books → **Re-import all**): the Shadowrun 6 books for the printing fixes, the
effects reader's third round and the Awareness rows; the Anarchy books for the sample runners, the core effect table and
the per-level entries. **The server's game settings were reset to their shipped defaults** with this release (Table
setup → Creation rules and the switches, both games): set a table's own changes again. Foundry: the Shadowrun 6 importer
module 0.6.0 and the Anarchy module 0.10.1 go with this release.

**Both games**
- **One catalog item per level** (owner decision 2026-10-11): an entry the books print with several levels or a rating
  range is one entry per level in Game data, the pickers, the sheets and the Foundry export, each with its own numbers
  and effects worked out; the details for each game are below.
- **Every switch and setting has hover text** in plain English saying what it does, then the book and page that prints
  it, or "house rule" or "option"; no label or hover text names another app (a test per game keeps it so).
- **Conditional and switchable effects get a tick box** (☐) as a reminder to count them when they hold: on the runner
  editor's cards (an entry's effects, an attribute's bracketed bonuses), on the printed sheets and in Foundry, where such
  an effect arrives switched off for the player to tick on.

**Shadowrun 6**
- **Rated ware and the printings** (fix/sr6-rated-ware-printings): a row the book prints per rating with its rating in
  its name (`Wired Reflexes 3`, `Cyberjack (Rating 2)`, `Cybereyes (Rating 5)`) carries that rating, so its per-rating
  effects count at it (Wired Reflexes 1–4 now give Reaction +1…+4 and the matching initiative dice; they all read as
  rating 1); an entry priced per rating or Force with no range printed (a focus's `Force × 4,000¥`, a cyberlimb add-on's
  `[Rating]`) is bought at a Force or rating the player sets; cyberlimb add-ons read their effects (Attribute increase
  to the attribute picked, Armor to the Defense Rating, Hydraulic jacks' jumping threshold); a rating-band price table is
  read by its columns (the explosive packages are back in every City Edition, with their Availability); a later printing's
  renamed column is read by its words (Hong Kong's `VR MATRIX INIT DICE BONUS`); the printings rank by publication month
  (Berlin 2023 above Seattle 2021), a known printing is dated by it (no old errata applied over Hong Kong), and a field
  the newest printing leaves open takes the newest older printing's value, noted `<found how="printing">`, the same in
  any import order; the Face's and Street Samurai's attribute split no longer depends on the process (Body first on a tie).
- Derived values the core rulebook prints, each from a creation setting shipped at the Hong Kong City Edition's number
  (Table setup → Creation rules, and a runner's Creation rules): Damage Overflow is Body × 2 (p. 121, `overflowPerBody`);
  no more than 5 initiative dice (p. 39, `initiativeDiceMax` 5, shipped); an augmented attribute at most its natural
  rating + 4 and a skill's bonus dice at most +4 (pp. 37, 39: what is left out is named on the attribute's card and in
  Review); Glass Jaw leaves at least 2 Stun boxes (p. 76); Matrix initiative AR, VR cold sim (+1D6) and hot sim (+2D6)
  from the best commlink's Data Processing or a technomancer's Logic (pp. 179, 189); movement 10 m, Sprint 15 m + 1 m a
  hit (pp. 42, 44); unarmed damage 2S, Physical with Dermal Deposits or bone lacing and density (pp. 71, 94, 286, 291);
  a spellcaster's Attack Rating, Magic + the tradition's attribute (p. 132); a melee weapon's Attack Rating with
  Strength (p. 39; a whip's with Reaction, p. 250); each weapon's skill and dice pool on the Gear tab and the sheet.
- Levels of play, off by default (Table setup → Creation rules → Levels of play, or a runner's own): the core rulebook's
  street level (each priority gives the row below's values) and prime runner (twice the customization Karma), CRB Hong
  Kong p. 63; the Sixth World Companion's street-level (B C C D E, sum-to-eight, 80 points, 6 life modules, no illegal
  gear but cyberdecks) and elite (A B B C D, sum-to-twelve, 120 points, 10 modules, no Availability cap), pp. 14–15,
  each with its numbers as settings. Only one level is on at a time (see nested optional rules below).
- Karma to nuyen both ways on Contacts & lifestyle: "1 Karma → 2,000¥" and "2,000¥ → 1 Karma" (with In Debt, 5,000¥),
  so one missed click is undone with one more. Turning nuyen back only undoes an earlier conversion at the same rate
  (never below none), so the rule is the book's (CRB Hong Kong p. 66); nuyen already spent shows as overspent on the
  budget and in Review, as any overspend does.
- Nested optional rules: a rule that builds on another sits under it on Table setup and on a runner's Creation rules,
  greyed and disabled with "needs …" while its parent is off, and it doesn't apply then (its stored value kept): the
  expanded contacts' numbers under Expanded contacts (SWC p. 161), each Alternate Power Level's numbers under its level
  (SWC pp. 14–15), Twenty Questions' karma, High Strength's steps, Working for the Man/People's rates (SWC pp. 25, 150,
  153), Stacking Advantage under the core Attack Rating against Defense Rating lead (SWC p. 144, CRB Hong Kong p. 45).
  The four levels of play can't be on together: the second says why; the runner's rules keep one (a campaign's lock,
  else the runner's own, else the first), so the engine never applies both, and Review notes a runner's choice set
  aside. The settings table in the data format document gains needs / not with / in place of columns. All still off.
- Qualities naming their choice (`Exceptional (Attribute)`, `Aptitude (Skill)`, `Impaired (Attribute)`, `Incompetent
  (Skill)`) take the attribute or skill from their note, which the Qualities tab now edits; one naming nothing is a
  Review problem, and one may be taken again for another choice. Exceptional raises that maximum, once per attribute
  (CRB Hong Kong p. 71); Impaired lowers it a level at a time, never below 2 (p. 76); Aptitude raises the selected
  skill's caps only, 7 at creation and 10 in career (p. 70); Incompetent forbids ranks in its skill, and isn't for a
  Magic or Resonance skill the runner can't use (pp. 76–77); Sensitive System doubles cyberware, bioware and nanoware
  Essence and can't be had with Magic or Resonance (p. 78). The importer no longer reads Exceptional's maximum as a
  raise of the attribute too.
- Improved Ability (CRB Hong Kong p. 157): the skill it is for is its note (the Magic tab edits it), it may be bought
  again for another skill, it costs 1.0 power points a level for a combat skill and 0.5 for any other, its levels add to
  that skill's pool, and Review asks for a rank in the skill and a boosted skill at most 1.5 times the rank (rounded up)
  or +4. The importer reads the two prices (`cost`, `costCombat`). A pick now keeps a note (the runner file's `<pick
  note>`), and a power's or quality's `skill:choice` and `attr:choice` effects go on what its note names.
- Ware that can't be combined (CRB Hong Kong pp. 157, 286–293): the importer reads each augmentation's, adept power's and
  quality's "incompatible with", "cannot be combined with" and "only one installed at a time" into its entry, and Review
  flags each pair the runner has (bone lacing with bone density or a second lacing; muscle replacement with muscle
  augmentation or toner; reaction enhancers, wired reflexes, synaptic booster and Improved Reflexes with what raises
  Reaction or Initiative; dermal plating with orthoskin; a supplement's quality pairs). Reaction enhancers with wired
  reflexes is a note: the wireless bonus allows it. The Sixth World Companion's Suprathyroid Bonuses Stack (p. 149) is
  a switch, off.
- More of the core rulebook's checks (Commlink6 makes them too): one specialization a skill but Exotic Weapons, which
  takes several (the Skills tab's further specializations), needs one to be used and takes no expertise (CRB Hong Kong
  pp. 65, 95); Astral only for magicians and for adepts with Astral Perception (p. 93); one Native language, the others
  to Expert at most (pp. 67, 99); the initiate and submersion grades never above Magic and Resonance (pp. 167, 195);
  foci only for the Awakened, no more than Magic, none of Force above it, their Force together at most Magic × 5, and
  each bonded for its Karma out of the customization Karma (pp. 154, 168).
- The Sixth World Companion's Expanded Specializations and Unrestricted Skill Ranks (p. 153), switches, off.
- A quality whose price line lists its prices (Bilko Contacts' and Import/Export's `7 or 12`, `10 or 14 Karma`, Seattle
  pp. 327–328; `3, 6 or 9 Karma`) is bought at one of them, chosen from a list, never a value between; a range (`2 to
  20 Karma`) keeps its stepper. The importer writes the listed prices as `karmaSteps`.
- More of the Sixth World Companion's optional rules, switches, off: Alternate Mystic Adept (p. 148), Twenty Questions'
  3 Karma at creation (p. 25), and Working for the Man and for the People (p. 153: 2,000¥ a Karma each way after
  creation, now each with its switch and its rate shipped).
- The shipped creation settings cite the core rulebook's latest printing, the Hong Kong City Edition (`CRB-HK`), every
  value checked against it (the one-attribute-at-maximum and adjustment rules p. 63, the initiative's 1D6 p. 67); the
  first printing's two readings ship off with Hong Kong's pages (`availabilityCapIllegalOnly`, `karmaSpellsAtCreation`:
  p. 68's footnote), and each optional rule on a runner's Creation rules names its book and page.
- **The Sixth World Companion's expanded contacts (p. 161) now ship off**, behind their own switch (`expandedContacts`):
  off, contacts take Charisma × 6 points, each rating up to Charisma (CRB Hong Kong p. 67). A book sample whose printed
  contacts need them gets the switch as an assumed rule when imported again.
- The Gear tab takes a target's Defense Rating and shows who gains Edge at each range band (p. 45).
- The importer reads a table of unarmed values (the bone lacing table: Body when resisting damage, Defense Rating,
  unarmed DV and AR) for each variant's row, and `unarmed damage becomes Physical` as an effect.
- Optional rules, off unless the table turns them on: the Sixth World Companion's Stacking Advantage (p. 144), Rolling
  Strength instead of Agility in Close Combat and High Strength Adds to Damage (p. 150).
- **Hover text on every creation setting**: on Table setup and on a runner's Creation rules, each row says in plain words
  what the setting does, then the book and page that prints it, or "house rule" or "option".
- The owner's decisions on the rules no book settles (2026-10-11):
  - Review **notes** (never blocks): attribute, adjustment, skill or knowledge points left (they're lost at Finalize), no
    lifestyle, no name or alias, a gun with no ammunition bought for its kind.
  - Review **errors a GM can approve**: Karma or nuyen left past what carries over (5 Karma, CRB Hong Kong p. 66; 5,000¥,
    p. 68; these were notes); a mystic adept's mentor spirit with no advantages picked (pp. 162–163: one, for good).
  - **Negative Karma or nuyen blocks Finalize** and no GM can approve it; building with it is fine.
  - **Not offered, refused**: Aptitude and Incompetent on the same skill; Sorcery, Conjuring or Enchanting for a pure
    adept; Elf Poser, Ork Poser and Human-Looking for a metatype their description doesn't name; an augmentation the
    runner already has (a limb or other paired part once a side). Review flags a file that holds one.
  - A mentor spirit on the Magic tab (with a mystic adept's advantages) brings the Mentor Spirit quality and its Karma;
    removing the quality removes the mentor spirit. One Native language a runner (the Native box on each language line).
  - A technomancer holds data structures by level: Karma equal to the level, level × 5,000¥ (Hack & Slash pp. 71–72).
  - New switches, off: Exotic Weapons' first specialization free, a mystic adept's mentor giving both advantages, data
    structure caps and initiation/submersion grade caps at creation (the GM's numbers under each), no used grade on
    cultured bioware, adjustment points on a lowered maximum, point buy's 450,000¥ errata version, knowledge points from
    Logic + Intuition, Elite sum-to-thirteen, Availability 7 at creation, the GM's own carry-over limits (house rules);
    Magic or Resonance 6 + grade at creation (CRB Hong Kong p. 167) and seats removed adding cargo by Double Clutch
    p. 126's Cargo Factor (options).
  - The Karma build, the positive-quality multiplier, a limit on Karma turned into nuyen and Karma for a mystic adept's
    power points are each behind a toggle of their own, off, with their numbers under it. An expertise with skill points
    now ships on (1); its hover text names the book's two pages that disagree (pp. 65, 68).
  - A sample runner whose numbers need the first printing's illegal-only Availability cap says "assumed: 2019 printing".
  - Sample runners: the only Review errors added are the Karma and nuyen left past the limits, which were notes before.
- **Effects, third round** (feat/sr6-effects-2; the Foundry importer module maps the new effect kinds):
  - The effects reader (importer/sr6/effects.py) reads the phrasings Commlink6 had and we missed, by general rules:
    a chosen attribute or Matrix attribute (`this attribute`, `the chosen Matrix attribute`), resolved by a variant row's
    words (`Cyberjack Boosters (Firewall)`), named actions and complex forms (`bonus dice on a Snoop action or Static
    Veil complex form`, a list after `action:`), a data structure's level in bonus dice (activated for one action, Hack
    & Slash p. 70), an Attack Rating modifier limited to fire modes (shock pads), an ammunition belt, a sense an entry is
    named for or grants (low-light and thermographic vision), a skill's maximum (Aptitude, Genetic Optimization), a
    knowledge or language skill granted, Edge cost on a named action (Called Shot—Disarm), a chase pool's Edge, costs in
    percent (armor +10%) and nuyen a month, a drake's Armor by its Edge, Handling moved between on- and off-road, a
    rating subtracted from a stat, an AI's Matrix initiative, a spell's or complex form's per-hit modifiers (`net hits
    are added to the subject's Defense Rating`), the Overwatch Score, `an additional two Minor Actions`, `use the Move
    Minor Action an additional time`. A use-it-or-lose-it clause, the test an Edge is given on, `can only be spent` and
    `each time it is used` are no longer conditions; `each point of this mod` and `each point of X rating` are per
    rating; a `**Wireless bonus:**` label holds for the sentences after it in its paragraph; a cap (`up to a maximum of
    five initiative dice`) is not a bonus.
  - A variant or rating row with no text of its own reads its parent's sentences about it (or the book's block when the
    parent is no entry); a text that is only label lines takes the rule the book describes the item under; an ammo
    table's `–1S(e)` and `–2 to all` are modifiers; a skillsoft kind named in a program or gear row gives its skill at
    its rating.
  - A table row whose value cells hold no value (Body Shop p. 67, `Awareness | Extreme | —`) over rows indented under it
    is a group header, not an item: the indented rows are the items, shown with their group (`Awareness: Basic`,
    `Awareness: Tactical` at rating 1–3), each with its own paragraph of the heading's text (Basic: Edge on Surprise
    tests; Tactical: +rating dice on defense and surprise tests), ids carrying the group (`bs.awareness-basic`), the old
    `bs.awareness` kept as an alias; a transgenic of such a base links to each of its rows. Grouped rows everywhere
    (`DocWagon contract: Basic`) get ids with their group, the old ids as aliases.
  - Owner decisions of 2026-10-11, modelled as written: a bonus per level after the first (`R-1`, Nimble Fingers:
    counted and shown as rating − 1), the book's own value per rating (`R[1,1,2,2]`, for table-driven items), a raised
    maximum (`action-max:take-aim +rating`, Tremor reducer), `tests to resist X` as a condition in the bracket (Tough
    Gut: ingested poisons), a removed range band (`x`, shown `—`, Short Barrel), Attribute Overclocking's +1 per hit
    activated and shown; a stat's number carried into the next sentence that refers back to it (Weapon Commlink's
    Firewall 2, cumulative), Edge on a condition with no test named (Flare compensation: `test:other` with the book's
    words), a section intro's own-noun rule for the items it names (a missile's sensor rating on the attack), a
    formula's rounding noted (`edg/2 RD`, `RU` when the book is silent) and a bonus per N points of a quantity as a
    formula (`nanite-volume/2 RU`), all shown, never applied; what others get against the entry kept as
    `affects="others"` (worded "others get: …", never counted); an "after …" clause as a condition. The printed sheet
    prefixes a tick box (☐) to every conditional effect note, a reminder to count it when it holds.
  - Against Commlink6 1.14.0 (owner's measure, never committed): 737 → 835 of 1,107 effects agree (66.6% → 75.4%; Commlink6 keeps Awareness as one record whose Tactical variants no longer pair with our split);
    1,206 → 1,446 effects of ours it lacks (82 of them what others get, decision 16). The remaining gap is mostly Commlink6's own encodings (variants, choices,
    copied rules) and values the book doesn't print beside the target.
- **One item per level** (feat/sr6-per-level; docs/sr6-data-format.md "Levels"):
  - **One catalog item per level** (owner decision 2026-10-11; docs/sr6-data-format.md "Levels"). An item the book
    prints with a rating range (Wired Reflexes, Cybereyes, a Fake SIN, a focus with a range) or taken by level up to a
    printed maximum (Built Tough, Combat Sense, a metamagic taken again) is now one entry per level in Game data, the
    pickers and the Foundry export: `Glow Eyes 1`, `Glow Eyes 2`, `Glow Eyes 3`, each with its own cost, Availability,
    Essence, Karma, power points and effects worked out. Rows the book already prints per level (`Cyberjack (Rating 2)`,
    `Wired Reflexes 3`) are grouped the same way. Nothing to re-import: the catalog expands as it loads, and an edit on
    the printed entry reaches every level (an edit on one level is that level). An item priced by a rating or Force
    with no printed range or maximum (a focus's `Force × 4,000¥`, an autosoft, a cyberlimb add-on `[Rating]`, an adept
    power whose level the book doesn't cap) stays one entry with a stepper, until an edit gives it a range or
    `maxLevel`.
  - A runner's lines hold the level's entry: the rating select on a line and the level stepper on a quality or adept
    power move it to the sibling level. A saved runner naming the rated entry with its rating or level is moved to the
    level's entry once when opened (recorded in `<migrated>`), and until then still reads at its rating. In career play,
    buying a higher level of a quality or adept power the runner has replaces the lower one for the Karma difference (×
    `advance.qualityFactor`), and the new **Upgrade gear** spend replaces a bought item with a higher level of its family
    at the new level's price (the core rulebook prints no trade-in rule; the accessories and grade stay).
  - A creation setting naming a quality (`builtToughQuality`, `aptitudeQuality`, `inDebtQuality`…) matches any level of
    it, so the standard settings keep working.
  - The Foundry export writes each level as its own entry (`attrs.family`, `attrs.level`); the Shadowrun 6 importer
    module needs no change (it keys documents by the entry id and reads the rating from `values.rating`). A re-imported
    book adds the per-level items beside any older rated ones (the module never deletes).
- Awareness (Body Shop p. 67) is therefore `Awareness: Basic` and `Awareness: Tactical 1`, `2` and `3`, each with its
  own price, Essence and +1, +2 or +3 dice.
- **Metatype size pricing** (`metatypeSizePricing`, on, house rule): a troll-sized runner (troll, cyclops, fomori,
  giant, minotaur) pays 10% more for everything bought, a dwarf-sized one (dwarf, gnome, hanuman, koborokuru, menehune)
  10% more for armor and clothing, as one line of the nuyen budget so every item still shows its printed price. No
  Shadowrun 6 book prints such a rule (the books price a few metahuman-sized items on their own: Double Clutch's
  Metahuman Adjustments p. 129, Body Shop's troll-sized shells p. 179), so the switch says house rule.
- **Languages** (owner, 2026-10-11): the Native language shows "native" on the Skills tab, the sheets and the Foundry
  export, where it counts as level 4; no language goes above 4 (`languageMax`, now 4: the stepper stops there and Review
  flags a file past it).

**Shadowrun Anarchy**
- Sample runners read the same in any import order: a book that adds skills, amp types or effects (or the core) has the
  other books' sample runners read again (the pregens booklet read before the Conversion Guide lost its technomancers'
  Tasking).
- A sample's Equipment amp printed without a gear line brings its own item, as the book's Equipment Amps cost the item
  and the upgrades (CRB p.144) and a catalog amp does in the app. A "(Quality)" with a deck's Firewall – Attack is a
  Cyberdeck (p.62); a "(Quality)" its equipment list also prints is an Equipment amp on that item (p.60). An amp named as
  the books' catalog amp of its type may carry the effects that entry prints (a sample's Jazz, p.150).
- Sample runners, the readings 0.5.6 dropped where the books support them (no approval written in the file): a printed
  limitation ("only", "first interaction", a drug's comedown) where the rules price the amp 1–5 above its printed rating
  is that Negative effect (p.61): the book's own, so Review needs no GM approval for it while the amp rates as printed
  (owner, 2026-10-11; a player's own negative effect, or one on a sample amp changed since, still does); a drone's or vehicle's own front-facing mount takes its first weapon (p.60,
  p.241); a shamanic mask is the Awakened amp's −1 (p.169, a new core effect); "+1 Edge per hacking scene in VR" is
  Initiative limited to VR; an armor row "(+1)" / "(2+1)" is an add-on over the armor above, bought for its own points
  (DHSA p.14); a branded commlink where the list has no plain one is the free commlink (p.85); gear an implant prints as
  "Integrated …" is part of it.
- Review: an effect one of the books' add-ons for a type prints is one that type may carry (DHSA's cyberdeck
  "Response increase" mods, Initiative in VR, p.19).
- On a fresh import of the eight books, in either order, the 28 sample runners show 3 Review errors (27 at 0.12.0),
  each the booklet's own: Keran's Cracking without a deck, Noonchi and Ty over budget.
- One entry per level (owner, 2026-10-11): an entry Daegann's list prints with several levels is one catalog entry per
  level, each with its own rating and effects. Freefall 1–3, Secret Room 1–5 (the player notes which upgrade each point
  went to), Secure safe 1–2 (the gear stays; its levels are Equipment amps), and the add-ons Attack +1…+5 and Firewall
  +1…+4 (cyberdecks), Additional Autosofts +1…+6, Engine Customization +1…+3, Smart Suspension +1…+3 and Identical
  additional drone +1…+2 (vehicles), and Improved home-automation host +1…+3 (DHSA p.16: a lifestyle add-on, Firewall
  up to 5 from Low's 2; it wasn't imported before): 10 families, 36 entries. A level's rating is what the book prints
  for it ("up to level 3 for 15,000¥"); an add-on's level is the add-on taken that many times.
  - The lowest level keeps the entry's id, so runners, GM edits and Foundry entries made on it stay on it; the other
    levels are new entries after it.
  - The amp picker lists a family's levels together ("Level 2 (1–3)"), as does Game data; the Amp Builder has a
    **Level** select for a book amp printed with levels, so a runner steps to the next level (after Finalize the
    change is priced and logged like any edit). An add-on applied before is still the book's on Review.
  - Two ranges have no top and stay one entry; the player sets the level: Enhanced Perception "3+" (one more
    Additional narrative effect, a sense, per extra rating: 15,000¥ at 3, +5,000¥ each) and Additional plates
    "max +Body" (applied once per point). The Amp Builder no longer offers an add-on or effect that would take a
    vehicle's Armor above its Body, an effect past its max or a deck's Firewall past 5.
  - Psyché's "Rating 10 for characters unable to cast spells" (CRB p.150, DHSA p.26) is its own entry, "Psyché
    (non-caster)", at 10 without the sustained spell.
  - Vehicle add-ons that only say what they improve in their text are read as that effect: Additional Autosofts adds
    Pilot, Engine Customization Speed, Smart Suspension Handling (they were narrative effects at the same rating).
  - The Foundry export gives each level `family` and `level`.
  - The Amp Builder's Negative effect is picked like the positive ones: five picks, "Negative effect (−1)" … "(−5)",
    each its own row with its value (no number box); the menu says a player's needs GM approval (p.61). A book's own
    drawback (a catalog amp's, a book sample's as printed) still needs none.
- Owner rulings (2026-10-10) on the rules no book states:
  - an amp may rate below 0 and gives nuyen back, with no GM approval; a book add-on rates as its effects alone
    (DHSA's Removed Manual Controls −1, was 0);
  - a custom specialization needs no GM approval (CRB p.52);
  - weapon focus has no max; mental armor is no general effect, only adept powers (Astral Armor) and a cyberdeck's
    Biofeedback filter carry it, as printed;
  - removing an amp effect is priced as replacing it with nothing (p.84): its cost comes back;
  - the SINner rule (free, never the first Quality) is a Table setup switch, on by default, labelled House rule; a runner
    may set its own on Review unless the GM locks it;
  - one free native language stays, labelled a house rule; a skill at 4+'s free knowledge entry starts as
    "Knowledge of <Skill>".
- Removing an effect from an amp is priced as replacing it with nothing (CRB p. 84): its cost comes back, at creation
  and after Finalize alike (verified, with a test).
- Every Anarchy switch says what it does when you hover it, in plain English, then its book and page or "house rule":
  Table setup's switches and Lock boxes, Review's Optional rules choices for a runner, and a language's Native box. No label
  or hover text names another app any more (the Foundry export page said "sra2"; it now just says the Anarchy 2.0 importer
  in Foundry VTT).

## 0.12.0 — 2026-10-10: effects for every entry in both games, totals as the books print them, Game data alike in both games

**Import the books of both games again** (Books → **Re-import all**): every entry gets the effects the new readers
take from its text and tables, and the sample runners are read with them. **The Foundry modules have matching
updates** (the Shadowrun 6 importer's effects v2 and the Anarchy module): install them with this release, so the
effects, links and bracketed totals in the export reach Foundry.

**Both games**
- One rule for every effect (src/engine/effects.ts, owner decisions 2026-10-10): the total shown first holds the
  always-on effects; switchable ones (wireless, activated, sustained) and conditional ones (in darkness, while in the
  Matrix) count in brackets, `Con 6 (9)`, `RR 1 (2)`, as a book's stat block prints them; a low-confidence one is shown,
  never counted; a spell's or complex form's effect on its target(s) never counts on the caster, and a sentence naming
  neither is the caster's. Each bracketed, caster or target effect has a note naming its switch, condition or whom it
  affects: on the attribute's card and a pool's hover, in Review's "What its effects do" and on the printed sheet.
- Game data is one page layout for both games (src/ui/GameData.tsx). The catalog comes first: the kinds down the left with
  their counts, the chosen kind's categories as chips across the top (Shadowrun 6: its category field, augmentations
  by type then body area), its entries with their values, Description and Edit. The **Book** list, the search across
  everything and **Needs attention** filter it. The sources and the Foundry export are folded under it until opened (the
  Sources heading gives the number of books), so a long book list no longer pushes the rest down; then the catalog
  edits, Problems and what each game adds (Anarchy: the loaded files; Shadowrun 6: where the creation rules are). Every
  Shadowrun 6 feature stays: the Edit buttons and compendium links, the override files, issues, effects, search and
  Needs attention.
- Game data opens on each game's main kind, Amps in Anarchy and Qualities in Shadowrun 6 (the list keeps its order),
  then on the kind last looked at, remembered per game in this browser. A private window or blocked storage just
  opens on the main kind.
- **Export book data for Foundry** has its icon in the header's right-hand group, beside the game switch, Settings
  and the account. It unfolds the export and scrolls to it, and its address (`#/data/foundry`,
  `#/sr6/data/foundry`) opens the page with it unfolded. Only for those who may export: the admin and editors (GMs in
  Shadowrun 6).
- An attribute shows its card on hover, focus (Tab) or tap, as an entry's card does: its natural and augmented
  ratings, its maximum, what raises it, and the rule's source and page. Shadowrun 6 adds the attribute's description
  (from the book's private texts) and lists each pick, line of gear or quality adding to it (the same lines its
  augmented rating adds up), and Magic or Resonance lost to Essence. Anarchy has no augmented attributes, so the two
  match, and its data has no attribute descriptions; its card lists the amps giving Risk Reduction on the attribute's
  tests.
- The career Ledger names entries with their cards too. Shadowrun 6: the entry picked to spend on, the price line
  (the attribute, skill, quality, power, gear or lifestyle being bought) and each history line. Anarchy: each history
  line's attribute, skill, specialization, amp or item. An SR6 NPC's Stat block names its catalog entry with its card.
- The attribute card lists what the total counts, then the switchable and conditional bonuses (or Risk Reduction) in
  brackets with their notes.

**Shadowrun 6**
- Effects for every entry: the importer now reads what each quality, adept power, piece of ware, gear, weapon,
  armor, ammunition, accessory, vehicle mod, spell, critter power, metamagic, echo, program, focus and mentor spirit
  does from its description and the book's tables (before, only a few granted qualities and add-ons had any).
  Attributes, attribute maxima (an infected type's table), Defense Rating, initiative and Matrix initiative dice,
  Physical, Stun and Overflow boxes, skill pools, Matrix attributes, item stats (Attack Rating per band, Damage
  Value, Handling, Speed …), lifestyle points.
- Test types: a bonus on "Social tests", "tests using Charisma", "Matrix tests", damage, drain or toxin resistance
  is stored as that test type and shown on every pool it covers, from the book's own lists of which skills belong to
  each (owner decision 2026-10-10).
- New kinds of effect for rules that aren't a plus or minus: bonus Edge on some tests, an Edge boost or action costing
  less (or more), no Edge spent or gained, a wild die, extra hits, an Edge action's new cost, an extra Minor or Major
  Action, Hardened Armor, the Overwatch Score. The hover card shows them; the printed sheet lists them under Effects.
- An entry that grants another ("both forms gain the Built Tough quality", "1 free level of Rapid Healing") or works as
  another ("the same result as a Personalized Grip") links to it, and the app uses that entry's effects, so a later
  correction follows (owner decision 2026-10-10).
- Every effect says how it's turned on (always, wireless, activated, sustained, on some tests: the condition's words)
  and how sure the reading is. A player's own bonuses still override.
- Totals as the books print them (owner decision 2026-10-10): the number shown first holds the always-on effects, and
  the switchable and conditional ones are added in brackets, `Con 6 (9)`, `Agility 5 (7)`, on every sheet, Review and
  the Skills tab. Attributes now show that way too (with their always-on bonuses, the switchable ones in brackets).
- A bonus limited to a specialization (`+2 dice on climbing tests`) is added to that specialization's pool when the
  runner has it, else to the skill's bracketed total.
- Tests the book names by activity are stored as that activity's skill (grappling: Close Combat; escaping bonds,
  balance: Athletics; haggling: Influence …), from the core rulebook's skill descriptions, with the specialization when
  the activity is one.
- A spell's or complex form's effect says whom it affects: the caster (counted while sustained, in brackets) or its
  target(s) (stored on the spell, never counted on the caster); a sentence naming neither is the caster's, in both
  games (owner decision 2026-10-10). A spell's bonus per net hit is shown, not applied.
- Conditional effects ("while in the Matrix", "in darkness") count in the bracketed total like switchable ones, in both
  games, and every bracketed, caster or target effect has a note naming its switch, condition or whom it affects: on
  hover over an attribute or pool (Attributes and Skills tabs), in Review's new "What its effects do" list and under
  the sheets' Effects or Notes.
- An item whose description the book prints under a rule named for it (`Move-By-Wire (Rating 1-2)`, `Stealthlink
  Upgrade`, `ProCams and SmartCams`) reads that text.
- A statement a section makes of all its items applies to each (`Each cyberlimb adds one box to the Physical Condition
  Monitor`: arms, legs, skull and torso; partial limbs are excepted). A variant priced from its base item (Body Shop's
  transgenics: `Transgenic gills`) works as that bioware and uses its effects.
- More phrasings read: several attributes raised together, Edge costs (`the cost of Edge actions … are increased by
  one`, `Edge Boosts cost 1 less in cybercombat`), bonus Edge added to a pool, an action named by the test it is (`Edit
  File`), Power Points, an artificial skill at the hardwire's rating, `the Magic attribute at 3`, a threshold lowered
  (`subtracts its rating from the threshold of Toxin Resistance tests`), dice equal to a quality's level, a reduction
  by the item's rating. What others' tests against you do (`Hearing tests to listen for your passage`) is not the
  entry's. A variant printed under a bold label (`Endosymbionts (Halcyon)`) reads only its own paragraph.
- Vehicle design options keep their Design Point cost (`dp`, `2 x Armor Rating`) as a cost, for a designer later.
- Descriptions the effects rely on: one cut at a page break with a table between its halves gets its rest back
  (Cyberjack Boosters, Light emitters); a mentor spirit's Advantages and Disadvantages stay with it; the Companion's
  metagenic qualities each have their own text instead of the whole list's; a variant row gets the paragraph the book
  prints for it under its parent (Genotype Enhancement (NeoElastian)).
- The Foundry export carries every effect (with how it's turned on, its condition, its specialization and whom it
  affects) and every link, and both totals: `derived` (always-on) and `derivedOn` (switchable ones on), an attribute's
  `switched`; the condition monitors take Stun and Overflow bonuses.

**Shadowrun Anarchy 2.0: machine-readable effects**
- What a narrative effect does is now an effect of its own kind (CRB p.59), at rating 0 so every book rating stays as
  printed: Advantage on a Test (or for 1 Edge), Disadvantage on a Test, no Disadvantage (a vision), a Disadvantage
  inflicted on someone else, an automatic effect for 1 Edge, gaining Edge, a Test it allows, ignoring wound modifiers,
  social armor, Matrix armor, a risk dice minimum, a forced High or Extreme Risk, an extra sustained complex form, the
  last Essence point counting double, magic spared the first Essence point lost, a wound it causes, and an immunity.
  Every catalog has them (the Amp Builder offers them); a data file may define its own.
- Every effect says how it is turned on (`switch`: wireless, activated, sustained, conditional; none: always on), when it
  holds (`when`), whether the importer is sure of it (`confidence="low"`) and the entry it is given by (`from`): the same
  rule as Shadowrun 6 (one shared module). A low-confidence effect is shown and not counted. A switchable one
  (wireless, activated, sustained: a drug's dose, a sustained spell) or one that holds only sometimes (`when`: in
  darkness) counts only in the bracketed total: a total is printed as the books print it, without them and in brackets
  with them, `RR 1 (2)`, on the sheets, the Skills tab, the receipt and in the export, each named in a note (the hover
  on a pool's Risk Reduction, Review's What its effects do, the sheet) (owner, 2026-10-10). A player's or GM's own effects override the book's: the Amp Builder
  and the Gear tab have "How it is turned on" and "Counts" for each.
- Items (spells, complex forms, plain gear) and metatypes (the racial quality) carry effects too: a drug's Disadvantage,
  a spell's Advantage or armor (by hits: shown), Low-light vision. A spell's or complex form's say whom each affects,
  read from its sentence (`affects`: the caster, else its subject or targets): the caster's count on the caster while
  sustained (in brackets); a target's stay on the spell, marked "affects target(s)".
- The importer reads them as general rules from every clause (importer/effects.py): Advantage and Disadvantage on the
  Tests a clause names (skills, specializations, attribute-based Tests), a dose's `Duration:` (activated), a condition
  (`when …`, `while in VR`, `once the effects fade away`), a value by hits (low confidence), and effects given by
  reference (`like an elf`, `acts exactly the same way as …`, `identical to the Initiative Enhancement Amps`). It also
  reads `DV+1`, `+1 Edge point per VR scene`, `+1 action per VR narration`, a range set or increased, `+1 Mental armor`,
  `vehicle armor by +N`, `RR 1 on all …` and an extra Light damage box. A Test named by what it does (`Tests involving
  speed`, `social Tests`) is every skill it uses. Misprints with a clean reading are read (a doubled parenthesis; `RR 1
  Resonance (tasking)` as Tasking); the rest are suggested for the edits layer.
- An effect the book states but its printed rating doesn't pay for (Novacoke's RR on Perception (Social), Smashing
  Blow's DV) is added `unpriced`: it applies, the rating and price stay as printed, and the import report lists it.
- A bonus limited to a specialization is added to its pool when the runner has the specialization, else its Risk Reduction counts in
  the skill's bracketed total, marked "RR (spec.)" with a note naming the specialization (owner, 2026-10-10).
- Effect coverage (entries whose book text states a modifier, with every one read into an effect): 482 of 704 (68%)
  before, 684 (97%) now.
- Derived values, sheets and Review: a dice pool lists the Advantages and Disadvantages on its Test (Adv., Adv. for 1
  Edge, Dis.; never dice); social damage thresholds (Willpower + social armor); Matrix armor on the Matrix thresholds;
  sustained spells and complex forms (1 without a Disadvantage, 2 at most, CRB p.178, plus each extra); extra summoned
  spirits; wound modifiers ignored; a forced Risk; VR, rigger command console drones and a vehicle control rig;
  Essence's death and magic thresholds moved by the qualities that move them. Review lists what the runner's effects do.
- Foundry export: each effect's line, `applied`, `switch`, `when`, `confidence` and `from`; an amp's shared switch; sra2's
  feat counts (`sustainedSpells`, `sustainedForms`, `summonedSpirits`, `riggerConsoles`, `vehicleControlRig`); Matrix
  armor in `matrixThreshold`; items' and metatypes' effects; a pool's notes, the runner's effects block and its social
  thresholds; `switched`, the totals with the switchable effects on; `unpriced` and `affects`. `rr` and `bonuses` count
  the effects that apply. sra2 has no Foundry Active Effects (the Foundry importer's feat/effects reads all of this).
- Book sample runners: Drakk's and Neon Ivy's drugs (Jazz, Kamikaze, Bliss…) are activated, so their Risk Reduction and
  initiative now print in brackets; every other number is unchanged. Each gains the effects its lines and racial quality
  state (Low-light or Thermographic vision, a decker's Advantage on Cybercombat, a drug's ignored wound modifiers and
  forced Risk) and the RR its amps give on specializations it lacks, in the skill's bracket.

## 0.11.4 — 2026-10-10: stat blocks read as printed, implant grades on add-ons, an entry's card where it's named

Import the SR6 books again (Books → **Re-import all**) so the sample runners are read with the new rules.

**Shadowrun 6**
- How a book's stat block prints a bonus (owner, 2026-10-10): brackets, `4(6)`, show a bonus that can be switched on or
  off (wireless, activated, sustained) with it on; an always-on one (a reflex recorder, muscle toner, a passive adept
  power) is folded into the printed number. A sample's natural value is the printed number less its always-on bonuses,
  unless the brackets already hold them all; Review notes each such reading. Every bonus and catalog effect now says
  how it is turned on (`switch`: wireless, activated, sustained or conditional; none is always on).
- The earlier reading of a rank above the cap as the natural rank plus a switchable bonus's dice (`Con 7` with a voice
  modulator) is gone: a rank printed without brackets is the natural one, so `Con 7` is rank 7 and the error stays.
- A book sample's reflex recorder adds 1 to the skill printed with it (core rulebook p. 293); one printed for two skills
  (`reflex recorder (Close Combat & Firearms)`) is one recorder per skill, each priced and with its Essence. Improved
  Ability adds its level to the skill printed with it.
- `+1 Edge on … tests` in an entry's text is a bonus Edge point on those tests, never the Edge attribute.
- Firing Squad's clothing: a stat box titled as its heading (Securetech SkinShield, Armanté Suit/Dress, the Mortimer of
  London greatcoats) is one armor entry with its description, no rule entry beside it; a TYPE table in an item's own
  text (Rapid Transit's Basic … Diamond) is that item's variants.
- A sample's gear printed with a maker before the name (`Ares Securetech SkinShield`), a garment word swapped (`Mortimer
  o.L. Crimson Sky Dress`), an initialism (`o.L.`) or a variant in parentheses (`(… diamond)`) finds the one catalog
  entry it names. The armor worn is the one with the highest Defense Rating.
- What a sample prints fitted to a host with Capacity (`Cyberears (rating 3; w/ audio enhancement, select sound filter
  3, …)`) is the host's accessories, priced; one the host's text says it has (cyberears' sound link, cybereyes' image
  link) takes nothing. Review's capacity error shows when they take more than the host has (the Smooth Operations
  Networker's cyberears: 10 of 8). An accessory fitted into a host's Capacity costs no Essence of its own, as the books'
  samples print it.
- An implant's accessories and add-ons always have its grade (CRB p. 282): their cost × the grade's cost factor, their
  Availability plus its modifier, any Essence they cost × its Essence factor; changing the implant's grade changes
  them, an add-on can't be given one of its own, and a file that gives one another grade is read at the implant's with
  a Review note.
- A grade a later book redefines gives way to the new one: with Body Shop imported, its omega grade is offered instead
  of the core rulebook's used grade (a line already used still prices and checks as before).
- Whether an accessory fitted into a host's Capacity costs Essence of its own is a creation setting,
  `capacityAccessoryEssence` (Table setup → Creation rules, Augmentation grades), off as before (CRB pp. 285–286 print
  both; the books' samples print the host's Essence alone), so it can be turned on without a new release.
- Extra spells, rituals and complex forms bought with the customization Karma at creation are an optional rule, off
  (CRB p. 66's list of what that Karma buys doesn't name them; Commlink6 has it as an option, off): a Review error past
  the free ones while it's off, for the priority and Sum-to-Ten methods. A runner can turn it on in its Creation rules;
  the book samples that need it get it as an assumed rule.
**Both games**
- Wherever the creation and editor screens name a catalog entry, hovering it, giving it focus (Tab) or tapping it shows
  the entry's card, as Game data shows it: its values, formulas with their values, effects (Shadowrun 6: applied, or
  shown only when switchable, conditional or read with low confidence), source and page, issues, an Edited or House
  mark, and its description; Escape, a tap elsewhere or moving away closes it. Shadowrun 6: qualities, skills and their
  specialization and expertise boxes, every purchase line and its accessories, spells, powers, complex forms and the
  other picks, martial arts styles and techniques, contact archetypes, lifestyles, the metatype and life modules, the
  Review lines that name an entry and the metatype's Karma line; every catalog picker's items. Anarchy: amps, items,
  skills and specializations, the metatype, package guide and lifestyle, the Review lines that name an entry; the amp
  and item pickers. Meant for checking a book's numbers where they're used.
- Game data's rows list an SR6 entry's effects too.

## 0.11.3 — 2026-10-09: per-runner creation rules, optional rules the sample runners pointed to

Import the SR6 books again (Books → **Re-import all**) so the sample runners are read with the new rules.

**Shadowrun 6**
- Per-runner creation rules, as Commlink6 has them: the Creation method tab lists the optional rules (the prime runner's
  Karma, the expanded contacts, the Availability cap and its illegal-only reading, the Karma and nuyen kept, an
  expertise's skill points, the quality count), each from the server, the campaign or the runner's own choice. A
  campaign's GM (or the admin) can lock any of them on the campaign's page; its runners keep the table's value, shown
  as locked with who locked it. Building, budgets, Review, the sheets, career play and the Foundry export (a `rules`
  list) all read the runner's rules. A runner without its own choices works as before.
- Book samples: where a book rule explains the printed numbers, the sample gets that option as its own rule, marked
  "assumed from the book's numbers (the book doesn't say)" in Review: the prime runner's 100 Karma for the overspends,
  the first printing's illegal-only Availability cap for a legal item past it.
- A level printed on a quality that has none (`Magic Resistance 2`) is read as the quality once, with a note.
- A printed skill rank above the cap is read as the natural rank plus a line's dice (`Con 7` with a voice modulator 3:
  Con 4), with a note; a bonus that holds on some tests only (a voice modulator's sound-based Con tests, wireless;
  tailored pheromones' Con and Influence tests in conversation range) shows with its pool and is never added.
- A book sample's misprinted line can be corrected through the override file (`<samplefix>` in the edits layer): the
  runner keeps the book's value, the app reads the corrected one, Review notes it instead of the error.
- Many Talents and Many Skills (Sixth World Companion p. 134): two attributes at their maximum, two skills at the
  highest rank, for a runner with the quality.
- A quality whose text says it isn't one of the six at creation (Lofwyr's Legions' Drake, Latent Drake) is read as
  such and left out of the count.
- The table may cap only illegal gear's Availability at creation, as the core rulebook's first printing does (p. 66);
  the later printings cap every item, so it ships off.
- At most 5 Karma left after creation, as the City Editions print (Hong Kong p. 66): a warning above it.

## 0.11.2 — 2026-10-09: the runner's effects everywhere, the sample runners' errors traced

Import the SR6 books again (Books → **Re-import all**) so the sample runners are read with the new rules.

**Shadowrun 6**
- One set of effective values for creation, Review, the sheets and the Foundry export. A line's bonuses are the
  player's or GM's own, else its catalog entry's effects (low-confidence ones are shown, never applied); a quality's
  catalog effects count too.
- An expertise can be taken at creation (owner's decision): it costs 5 Karma of the customization Karma, at the
  advancement price (CRB pp. 66, 68). Review shows an error only when it lacks its specialization or a skill rank of 5.
  The old "none can be taken at creation" error is gone; a skill above 6 without Aptitude is still one.
- Contact points and their rating cap count the augmented Charisma, knowledge skills the augmented Logic.
- The Sixth World Companion's expanded contacts (SWC p. 161), on by default: Karma buys contact points past
  Charisma × 6 and a contact's connection + loyalty past 2 × Charisma; no rating above 8.
- Exceptional (Attribute) raises the maximum of the attribute its note names (CRB p. 71). Charismatic Defense bases
  the Defense Rating on Charisma (Power Plays p. 85). A new bonus target, Physical monitor boxes: a full cyberlimb's
  box (CRB p. 288).
- The Magic Essence takes also comes off an adept's power points and the free spells and complex forms (CRB p. 66).
- Sample runners: `(Acting +3)` is the specialization made an expertise (both kept, the specialization paid); a
  quality printed with a level takes the entry with levels (`Addiction 5` is the core rulebook's); an item printed
  at a rating never takes another rating's entry (`cybereyes 3`). In Debt's `Bonus: None` is 0 Karma. What Review
  still shows on the samples is the books' own (rank 7 without Aptitude, a seventh quality …).

**Anarchy 2.0**
- The Foundry export gives each amp its share of the capped Armor +1, the same rule the sheet totals.

## 0.11.1 — 2026-10-09: prerequisites are errors, never blocks

Whatever a runner lacks a prerequisite for can now always be taken, in creation and in career. Review shows an
error, cited to the page that prints the rule, until the runner meets it or a GM approves it. Pickers list these
choices with a note ("not taught by this style", "for Eyeware, not this", "not for an adept"). They are never
hidden or greyed out. Budgets, caps, rating ranges, duplicates and the karma or nuyen a spend needs work as before.

**Shadowrun 6**
- Martial arts: a technique missing its adept power, technique or quality is now an error, like a missing
  augmentation (Firing Squad p. 97). A technique the style doesn't teach can be taken, from the tab and the Ledger.
  Both errors are approved per technique.
- Metamagics: the Magic tab and the Ledger list every metamagic. An adept's on a magician, or a magician's on an
  adept, is the `magic.metamagicUser` error.
- Spells, rituals, complex forms and adept powers: the Magic tab shows every section, with a note when the runner's
  magic kind can't learn them (CRB p. 67). The Ledger learns any of them. An adept power still needs power points.
- Specializations and expertise: these can go on a skill with no rank (CRB p. 93), and an expertise can be taken
  without a specialization (CRB p. 69). Each is a new error. An expertise also needs a skill rank (CRB p. 69): the
  new Advancement setting `advance.expertiseRank`, 5 by default. Below it is the new `skill.expertiseRank` error.
- Grades: a grade an augmentation's type doesn't come in can be taken (CRB p. 283, or the catalog grade's page).
  It's the new `gear.grade` error. Only augmentations and custom lines take a grade.
- Accessories: the picker lists other hosts' accessories, marked. Fitted, one is now the `catalog.accessoryHost`
  error instead of a refusal.
- Lifepath: modules for an awakened, emerged, adept or magician runner are offered to every runner, marked. Taken
  by another, one is the new `lifepath.requires` error, cited to the module's page.
- A granted-only quality with no quality offering it is now an error (`quality.granted`). Taking more of a list
  than its choices allow is still a warning (`quality.grantedCount`).
- Career Review also shows these errors for spends recorded since Finalize, as well as a Magic or Resonance skill
  the runner's kind can't use.

**Shadowrun Anarchy 2.0**
- A spell without the Sorcery option on the Awakened amp (CRB p. 58) is an error, as is a complex form without the
  Emerged amp (CG p. 9). The Gear tab always shows its Complex forms section.
- An amp effect whose required effect the amp lacks can be added, marked "requires …". Review's `amp.requires`
  error stays. An effect it can't be combined with is still blocked.
- A specialization can be added to a skill at rating 0, which is the `spec.noSkill` error (CRB p. 52).

## 0.11.0 — 2026-10-09: martial arts, SINs with their lifestyles, catalog flags, Foundry export

Import the books again (Books → **Re-import all**) to get technique prerequisites, the catalog flags and Bending of
the Reed's two versions. Saved runners keep working: an older runner's lifestyle moves onto its first SIN, or onto an
unnamed placeholder SIN when it has none; an older Bending of the Reed becomes the Melee version.

Released with the Chummer SR6 Importer 0.3.0 and the Chummer Anarchy 2 Importer 0.8.0 Foundry modules, which read
the new export.

**Martial arts (SR6)**
- A Martial arts tab, next to Qualities and Magic. Buy a style (7 Karma) and learn its techniques (5 Karma each; the
  signature technique is free), in creation and in the Ledger (Firing Squad p. 97). Both prices are house-rule
  settings. Review flags a style or technique taken twice and a technique its style doesn't teach.
- Technique prerequisites. The importer reads what a technique also needs from its printed category line: an adept
  power, another technique, a quality or an augmentation. The picker and the technique's row show it. Review warns
  when an adept power, technique or quality is missing. A missing augmentation (a cyberlimb, bone lacing, an
  implanted firearm, …) is an error a GM can approve; the technique can still be taken.
- A technique learned in one of the options it lists, once per option, is one entry per option: Bending of the Reed
  (Melee) and (Ranged). Body Shop's techniques now get their category.

**SINs, lifestyles and gender**
- A lifestyle belongs to a SIN. A runner can have several SINs and several lifestyles, and a SIN can have none.
- Gender is optional on the runner (both games) and on each SIN. It's free text, with common entries suggested as
  you type.
- In career play the Ledger buys a SIN at its creation price (a fake SIN by its rating, a real one free, plus its
  licences), and lifestyles at their monthly price × months. Either is refused when nuyen is short. A SIN bought in
  career needs a name.
- An older runner whose lifestyle has no SIN to go on gets an unnamed placeholder SIN. It costs nothing, and Review
  notes it until it's named (Contacts tab, or the Ledger once finalized).

**Catalog flags (SR6)**
- The importer reads which metamagics are for adepts or magicians and which can be taken again, which spells are
  opposed or use the target's Essence (in the threshold or the resistance), and armor's Social.
- The builder offers only the metamagics a runner may take. More metamagics than initiation grades is an error a GM
  can approve. The picker, the Magic tab and the sheets show the flags.
- Social Rating (Charisma plus worn armor's Social) shows in Review, on the Gear tab and on the sheet.
- A hand-entered bonus can add to a skill's dice pool.

**Foundry export**
- The book export carries every kind, implant grades and the display kinds included, and each entry's earlier ids.
  Anarchy's adds its reference kinds (levels, packages, lifestyles, amp types and effects, attributes).
- The runner export carries the catalog's effects, Defense Rating and skill bonuses, the monitor bonus, Social
  Rating, contact types, gender, SINs with their lifestyles (placeholders marked), and martial arts with each
  technique's prerequisites.

## 0.10.6 — 2026-10-09: every Commlink6 record found

Import the books again (Books → **Re-import all**) to get these. Saved runners keep working.

Measured against Commlink6 on all 74 books: completeness 100% (4,335 of 4,335 records), accuracy 99.98% (2 of
12,544 fields differ: the MGL-24's misprinted availability, which an override fixes). Values Commlink6 copied from
another row, column or book are its own and are never copied into our data.

- **Choices on any entry.** A skill, specialization, knowledge skill, sense, true element or licence type can be
  chosen on any entry that asks for one, not only on qualities.
- **Senses.** "Select a sense (sight, hearing, touch, taste, or smell)" makes the five senses, and Improved Sense
  asks for one.
- **Magic types and licence types** are built-in lists; Fake License asks for a licence type or a named (L) item.
- **Granted qualities from rules.** A rule saying a character gains "the X (Y, N) quality" makes that quality:
  Addiction (Blood Magic), granted at 0 Karma with no level cap (Street Wyrd p. 157).
- **Critter powers defined in a power list.** Skill and Skill Specialization (Street Wyrd pp. 55–56) with their
  choices.
- **Focus options.** The true element tables (Astral Ways) are options a focus can take: True Earth sandcasting,
  True Air crafting, True Fire forged, True Water quenched.
- **Actions.** Counterspelling's two forms (Boosted Defense, Dispelling) and a rule opening "Spend a Minor Action
  to …" (Augmentation Overdrive, Zanshin) are actions as well as rules.
- **Grenades and explosives.** A table whose first column names a class shows its rows under it (Grenade: Gas);
  Conventional, Plastic and Foam Explosives are rated 1–20 and priced by the explosive packages table.
- **Sentence prices.** Water-Repellent Coating is an armor accessory (100¥).

## 0.10.5 — 2026-10-08: nearly every record, nearly every value

**Every SR6 book re-converts on its next re-import** (the converter is now sr6-7): use Books → **Re-import all** to
get these. Saved runners keep working: an entry the new reading renames or merges keeps its old id as an alias.

Measured against Commlink6 on a clean import of all 74 books: completeness 99.54% (missing records 178 → 20),
accuracy 99.27% (differing fields 426 → 92); 0.10.4 was 95.93% / 96.60%. Of the 92, 90 are values Commlink6 copied
from another row, column or book (each checked on the page): they are Commlink6's own and are not copied into our
data. The records still missing are the core rulebook items waiting on a decision.

- **Side-by-side boxes.** Two boxes printed next to each other are read apart, and text after a boxed sidebar goes
  back to the item it interrupted (Firing Squad p. 66, Deadly Arts' Combat MAID, Krime Katalog's shotgun ammunition).
- **Pages.** An entry found inside a longer block keeps the page it is printed on (Sixth World Companion's Dragon,
  p. 121).
- **Two items in one row.** A row named `A/B` printing two prices is two items, each taking its own value from every
  slashed cell (Federated Boeing Commuter and Osprey X).
- **Two options under one heading.** A heading naming two options with `/` is two entries (Increasing and Reducing
  Cargo Space); `X I/II` with `5/8 Karma` is two qualities; a heading naming two preparations with two prices is two
  items.
- **Optional rules you can buy.** An optional rule priced in Karma (Latent Awakening, Transhumanism, Neuromorphism)
  stays a rule and is also a quality.
- **Ammunition add-ons.** Copper, silver and gold rounds fit any ammunition and multiply its price (×2, ×5, ×10).
- **Headings paired with rows.** A heading whose first sentence names a table row is that row (Body Shop's Eye-Light
  System = Light emitters); a bold run-in names its row (Endo-Mender; NDE for the table's NDI).
- **Prices.** A back-matter price table prices the book's unpriced headings (the core rulebook's toxins and drugs are
  gear); prices in a sentence (a replacement instrument, NanoMask); `(Rating) x 500` is a rating formula; a `*` cell
  is never filled from another row; qualities priced `3, 6, or 9 Karma` or `5/8 Karma` carry a low and high cost.
- **Errata.** Renumbered ratings (No Future's cybereyes and cyberears), "no longer have ratings" items, reprinted life
  modules and "gives a bonus of N Karma" are applied.
- **Books.** Double Clutch, Street Wyrd, Sixth World Companion (PACKs, dermal alterations), Hack & Slash (AI
  variants), No Future, Body Shop, Tarnished Star, Bestial Nature, Astral Ways, Smooth Operations, Krime Katalog,
  Power Plays and Lofwyr's Legions are read at or near 100%.

## 0.10.4 — 2026-10-08: Firing Squad and brands

Import the books again (Books → **Re-import all**) to get these. Saved runners keep working: an entry the new
reading renames keeps its old id as an alias.

Measured against Commlink6 on a clean import of all 74 books: completeness 95.93% (4,197 of 4,375 records), accuracy
96.60% (12,135 of 12,562 fields); 0.10.3 was 95.07% / 96.52%. Firing Squad went from 90.93% / 94.08% to 99.49% /
95.20%.

- **Brands and versions.** An item can come in several versions, branded and generic, with different stats, and the
  name tells them apart. A table titled with its heading's own words lists that heading's items; when the heading
  prints a maker first, the rows are a brand's and are named with it: Zoé Heritage Bearded Axe, Zoé Heritage Tonfa
  (searchable as Heritage Tonfa and Zoé Tonfa), the brand their maker, while the generic Tonfa stays its own item.
  Rows of plain words under such a title are the heading's variants: Bayonet (Standard), Bayonet (Retractable).
- **Configurations.** An item whose box prints unpriced rows under its own (the Dassault Alpenstock's spear and
  knife, the Krime Thumper's shotgun) has them as configurations: each its own stats, linked to the item, never
  bought apart.
- **Reprints.** A book's summary tables at the back reprint its chapters' tables and make no second entries; a list
  reprinting a section's own list (Firing Squad's MEMS gear) doesn't either.
- **Quantity and per-unit prices.** "75¥ (per individual blade)" prices by the count bought, with a note when the
  book gives no maximum.
- **Accessories and supplies priced in a sentence.** "Batteries cost 100¥ each", "a laser sight (additional 50
  nuyen)", "an arm-brace for an additional 100 nuyen" are items now, linked to the item they belong to; what the
  text says an accessory does to its item is read as its effect (the arm-brace's +1 Near and Medium Attack Ratings).
  A row priced "additional 100¥" (the tactical hammer's knife/spike head) is an accessory of the item's other
  versions.
- **Typo search names.** A name printed with a letter three times keeps its printed spelling and is also found
  under the corrected one (Actioneeer Business Clothing: Actioneer).
- **Firing Squad, closer to the book.** The rEVOlution Arms Rhino and Behemoth and the Ingram White Knight Mod 1 and
  Mod 2 (boxes under a heading that names several), the underbarrel weapons, the paint grenades, Vashon Island's
  later suits (stats on p. 55), the new edge action Yielding Force, the Pacifist and No Code qualities, the Knight
  Errant and Lone Star Tactical styles, rEVO rounds as an ammunition type, footnotes under a weapon's stat box as
  its cells' notes, and rows the converter split over two lines.

## 0.10.3 — 2026-10-07: closer to the books

**Every book re-converts on its next re-import** (the converter is now sr6-6): use Books → **Re-import all** to get
these. Saved runners keep working: an entry the new reading renames keeps its old id as an alias.

Measured against Commlink6 on a clean import of all 74 books: completeness 95.07% (4,164 of 4,380 records), accuracy
96.52% (11,998 of 12,430 fields); 0.10.1 was 89.32% / 95.65%. Deadly Arts went from 83.90% / 93.58% to 99.69% /
97.88%.

- **A restart picks up where Re-import all stopped.** An update that recreates the container in the middle of
  Re-import all no longer leaves the books "stopped" or "Interrupted by a restart": the queue (the running book
  first) is kept and starts again on the next start, in both games, and the Books page shows its progress again. A
  time limit now says "timed out", never mistaken for a restart.
- **Indented groups.** A name-only row over indented rows names them (DocWagon contract: Basic, Gold, Platinum…), and
  a bold name-only row over rows of one price shape does too (Spell formula: Combat, Detection…). The rows keep their
  printed names; Chummer shows them with their group.
- **Stacked sub-tables.** A table stacked under another's title whose first header names a class is its own
  (FORMULAE, MAGICAL SUPPLIES under the magical goods table), and a plural first header the title doesn't name is
  the rows' category (GRENADES under explosives). A price list set inside an item's description (the credsticks) is
  read, and a table's last rows reaching into the page's bottom band (the drug table's Psyche and Zen) stay.
- **The Game Information reader.** Adventure and plot books' Game Information sections are read: their NPCs and
  contacts, gear, vehicles, life modules, toxins (from their Vector/Speed/Power lines) and a weapon's stat line set
  as text. Slip Streams, Dealers of Death, Shadows in Focus: New Orleans, Collapsing Now and The Kechibi Code went
  from a few entries to almost all of what they print.
- **Granted powers and characteristics.** Lists a section grants (Powers, Characteristics) are qualities granted at
  0 Karma, with their category; a heading priced in Karma is a quality whose "select N …" are its choices; the first
  prose effects are read (quality category, granted, effect, test and choice in the data model, with a Review note).
- **Only a valid SR6 value wins.** The value printed last wins, but only when it is a valid Shadowrun 6 value: an SR5
  term (a Complex action, an R or F availability) in a later book no longer replaces the core line's, and the entry
  says why.
- **Quality path steps.** A path's bare step heading (Step 2) is a quality shown with its path (Gestalt: Step 2), its
  Karma read from its prose or the path's; actions a section names as its forms (Boosted Defense, Dispelling) are
  actions.
- **Deadly Arts, closer to the book.**
  - The two-product ammunition tables (regular and HEX side by side): one entry a product, B25 and B25 (HEX Assault
    Cannon), priced per 10 rounds, searchable as Assault Cannon B25 or Autocannon B60 HEX.
  - The warhead types (Hex, Frag by Capacity band, APDS, CBU, CHEM, ILL, SMOK) as ammunition types.
  - The rocket and missile tables whose names and classes wrap over lines, and the extreme cyberweapon features.
  - The Omukade's three cars, the drugs, and the standard rocket and missile.
  - Items priced only in a sentence: small-caliber railgun ammo (3x the normal cost), and the Foundation and Spotting
    foci, priced as the core rulebook's spell focus by a cross-book reference the builder works out.
- **The new converter (sr6-6).** Running heads and page numbers are page furniture; two stat tables side by side
  in two columns stay two; a heading at the foot of one column titles the full-width table under it; a table's first
  cell marks its indented and bold rows; the bottom band drops only the running feet.

## 0.10.2 — 2026-10-07: more of the books read

- **More Shadowrun 6 entries read from the books.** Every named step of a quality path is now a quality (with "Gain N
  Karma" read); bold run-in names under a heading that names their kind (traditions, programs, actions, critter
  powers), "N Edge: X" Edge actions anywhere, fire actions and sprite commands; e-softs priced as autosofts; inherent
  qualities as powers; metamagic and sprite-type sections; qualities priced in points; the core rulebook's RCC table;
  Body Shop's transgenic lists split into their paired items; and a row that prints two names ("A / B Drone") gives
  both. Double Clutch's autosofts no longer replace the shared programs list.
- **A price printed "N each" reads as N** in the builder and the importer.
- Import the books again (Books → Re-import all) to get them.

## 0.10.1 — 2026-10-06: categories and accessories

Import the Shadowrun 6 books again (Books page → **Re-import all**) to get these: the catalogs change, saved runners keep
working.

- **Every item knows its table.** The title of the table an item is printed in is its category: the core rulebook's
  cyberlimb table makes **Cyberlimb**, its row **Arm (synthetic)** the item. Where a row's printed name needs that to be
  understood (a bare part such as Arm, Armor or Gel), Chummer shows it as **Cyberlimb: Arm (synthetic)** in every list,
  picker, Game data, Review, the ledger and the sheets. The printed name stays the item's name, and the category is
  its own field in exports. Search finds it by either, by both together and by the names the book composes
  (cyberarm, synthetic cyberarm, gel ammo).
- **Accessories go on the items they're made for.** A table titled "Cyberlimb accessories" (or modifications, mods,
  enhancements) fits cyberlimbs; "Weapon accessories" fit weapons. The accessory picker on a bought item lists only the
  accessories that fit it, a misfit can't be added, and Review flags one a runner file still holds, with the page.
  Where the book has no table for the host a title names, the category is flagged for you to settle instead of guessed.
  The same name in two accessory tables (a cyberlimb's Armor and another table's) is two items with their own prices.
- **An accessory's bonuses are its host's.** A bonus you put on an accessory changes the item it's fitted to, not the
  runner: a cyberlimb's Strength or armor shows on the limb's line ("This item: STR 5, Armor +2"), on the sheets
  beside it and in Review's derived values, and the runner's attributes stay as they are. The capacity accessories take
  ([2], [Rating]) is counted against their host's, and going over is a Review problem.
- **Echoes: 25, not 247.** An adventure titled "Echoes of a Lost Signal" turned every bold label in it (GM Note, Race,
  Age…) into an echo. A heading now names a kind only when the kind's word ends it ("New Echoes"). Four junk programs
  went the same way.
- **Shadow Cast's quality paths: no more "Roleplaying", "Strategies", "Combat".** A quality path needs steps under it
  and a name of its own, not a heading the book repeats in every chapter (43 → 37 there; each of the 37 is printed as a
  quality path).
- **Deadly Arts' Armsman polearm is read.** Its four configurations (Knife, One-hand, Spear, Pike) are four weapons
  with their own printed stats, in the category Armsman Collapsible Polearm, made by Cougar Weapons; the footnotes on
  their cells are kept with the cells, and the wireless bonus goes with each. A close-combat weapon's type (Blade) gives
  its Close Combat specialization.
- **More read from the books:** Body Shop's cyberware martial arts techniques, a priced table no book recipe read
  (Hack & Slash's IC types, Smooth Operations' BBS costs), footnotes on any table cell. Every priced table is now
  classified the same way in every book, and a table that doesn't fit the pattern (no title, a title naming no
  category, an accessory table with no host) is listed in the import report for checking.
- Measured against Commlink6: completeness 88.78% → 89.32% (Cyberarm, Cyberleg, Cyberskull, Cybertorso, Gel ammo,
  the Implanted Shotgun and more now match), accuracy 95.65%.

## 0.10.0 — 2026-10-06: book data from the PDFs, closer: formulas, data issues, override files, re-import all

- **Book values stay canon; what the book leaves out is flagged.** Where a book prints no value, or one the importer
  can't read, the entry carries an issue. Game data and the item pickers show a warning badge with the field, a short
  note and the book's page, and Game data's new **Needs attention** button (with its count) lists only those entries.
  A runner that uses one gets a cited Review note, such as "Null Box: the book prints no availability, set it in Game
  data or an override file." It's a note, never an error. Setting the field with Edit clears the badge; the edit dialog
  still shows what the book has ("book: none printed"). Both games; Anarchy's importer doesn't write issues yet.
- **Prices worked out by the book's formula.** An entry can say how a value is worked out (Rating × 200, a price by
  rating band, another item's price plus 50, a price per 10 rounds). The builder prices what you buy at its rating and
  quantity, in the budgets, the ledger and the exports. Lists show the formula and its range ("Rating × 200¥
  (200–1,200¥)"), and a bought item shows its price with the formula on hover. A formula that refers to something
  missing leaves the item unpriced instead of free. In Anarchy, an item's cost formula works from the standard price.
- **Override files.** Game data → Your catalog edits has **Export my edits…** (all edits, or one book's, as an edits
  file with their descriptions) and **Import edits…**, which previews what a file adds, changes and conflicts with
  before anything is saved. Pick Keep mine or Take theirs for each conflict. Editors and the admin, both games.
- **Re-import all books** (Books page, the admin, both games) rebuilds every book's catalog, rules and samples from its
  PDF after a confirm. Your edits, runners and NPCs are kept. The books queue one after another, each showing Waiting,
  Importing… and Imported, under a line counting how many are done. A book whose last import was made from the same
  PDF by the same importer version skips the slow PDF reading. A book folder that holds only its PDF (restored or
  copied in by hand) shows "Not imported yet" and imports from scratch. Books read by AI are left out, as with
  Re-import.
- **The Shadowrun 6 importer writes the book's formulas and flags what it leaves out.** A value printed as a rule
  (Rating × 2,000¥, Force × 4,000¥, a price per CF or per dose, 2,000¥ plus 500¥ per additional dart, a cheaper open
  version, one price per rating band, a DV of (1–10) S) is imported as its formula, so the builder prices it at the
  rating and quantity you buy. An energy weapon's ammo is worked out from the power supply it comes with. A missing
  availability, price, Karma, Essence, rating range, firing mode, ammo or vehicle stat, a value no style reads
  ("Special") and a cell printing two values get an issue, shown with the badge above. A price worked out from another
  item you pick (Commlink cost plus rating × 100) is an issue that states the rule, for you to settle with an edit.
- **Shadowrun 6 books read closer.** Table rows whose cells the PDF ran together, headers set on two lines, rows that
  print a shorter name than their description, a DV with its blast or a note in the same cell, a header printed twice,
  a price with a thousands point (1.200), vehicles printed as a stat line in the text, an ammo count or per-unit price
  only the description gives, and a Companion quality priced "See text" are now read. Weapons and armor carry their
  rating range (a mount priced by Size), and a weapon power supply its Energy. Import the books again (or Re-import
  all) to get them.

- **A missing value is searched for across all the books before it's flagged.** The importer looks in the item's other
  tables and sentences in its own book, then in the other printings, the cards and the other books, latest published
  first, and records where it found the value. Only what nothing prints becomes an issue, marked as searched. The
  official errata are applied to their own book.
- **Fifteen new kinds in Game data, read from the books:** actions (Edge actions and the rest), gear packs, vehicle
  design, ammunition types, mentor spirits, data structures, quality paths and sets, spell features, contact types and
  more. They're listed and searchable; how each is used comes later. Also read now: Deadly Arts' melee and mortar
  tables, Street Wyrd's adept ways (as qualities), Body Shop's transgenic versions (priced by their rule from the base
  item), rating ranges from rated prices, and items found only in a section's running text.
- **Saved runners keep working when an import renames or moves an entry.** Each import records the old id of an entry
  it renamed, re-kinded or merged; the app finds the new entry, and a runner's lines are updated when it loads (noted in
  the file). A runner that bought APDS or another ammunition type as gear finds it under Ammunition types.

## 0.9.11 — 2026-10-05: example characters audited, Hex and Dossier sheets, adept power points

- **An adept gets a power point for every point of Magic, raised Magic included** (CRB p.157). Power points came only
  from the priority's Magic, so an adept who raised Magic with adjustment points or karma read as overspent; the
  importer's priority fit counts them the same way. The core rulebook's Adept now has no rule problems (import the core
  rulebook again to get it).
- **A specialization the skill points can't cover is bought with karma** (5 karma, CRB p.69) instead of overspending
  the skill points, so a runner whose ranks use up the points can still take one.
- **A quality priced in a range (Allergy's 2 to 20) keeps the karma it was taken for.** Qualities shows a karma stepper
  for it; before, it always counted its lowest price.
- **Shadowrun 6 sample runners, read closer.** A metatype's own quality is free even when the block doesn't say
  "trait" (Smooth Operations' troll, dwarf, elf and ork faces were paying for theirs); an Allergy is priced from its
  printed severity and allergen; a face's qualities from the Sixth World Companion, Double Clutch, Firing Squad or Power
  Plays are found when that book is imported; and a sample no priority assignment can pay for is fitted with
  Sum-to-Ten. The core rulebook's Covert-Ops Specialist and Face and four of Smooth Operations' faces are now within
  their karma (import the books again to get them).
- **Table setup → Creation rules fits its panel on Shadowrun 6.** A long quality name in a dropdown pushed the table past
  the panel and cut off the Page and Standard columns.
- Shadowrun 6 runners print in two more styles (Sheet type, or Settings → Printed sheet), for six in all: Hex, one page
  with the attributes and the damage tracks as hexagons (the tracks on a dark band, boxes past the runner's monitor
  blacked out), every skill as [rank] [pool], core combat, qualities and a blank Edge panel by cost; and Dossier, rounded
  panels under magenta title bars over up to two pages (personal data, Edge and nuyen, portrait, attributes, positive and
  negative qualities, condition monitor, skills, weapons, armor, then augmentations, gear, contacts, IDs, magic and
  vehicles), printed with the date and page number at the foot. Anarchy's sheets are unchanged; with Hex or Dossier
  picked, an Anarchy runner prints Printer-friendly.

## 0.9.10 — 2026-10-05: softer neon, pink as a highlight, Review notes only for what a runner uses

- **A runner's Review lists only the catalog problems it is touched by.** A book's unreadable number or a metatype trait
  that isn't in the catalog used to show on every Shadowrun 6 runner (dozens of notes about books the runner never
  used); now it shows only on runners that use that entry. The Books page's import report still lists them all.
- **Shadowrun 6's neon is a shade softer, and pink is only a highlight.** Links, hovers, tags and other small text are
  cyan now (pink small text was hard to read); pink stays for the rule under titles, the current tab and focus. In the
  dark look the cyan and pink are toned down and the glows are fainter.
- **Quieter Shadowrun 6 pages.** Only the page title keeps the full pink hatched rule; a box's title gets a short pink
  tick. Table headings and the Game data list read in plain sentence case instead of cyan capitals, and Review's
  problems read as ordinary text (a link on hover) instead of a column of underlined cyan.

## 0.9.9 — 2026-10-05: two new Shadowrun 6 character sheets

- Shadowrun 6 runners print in two new styles (Sheet type, or Settings → Printed sheet): Book style, laid out like the
  official character sheet's boxes over two pages (Edge as hexagons, damage tracks three boxes a row), and Neon, one
  dense page for play with the best dice pools up front, in dark ink with cyan and pink accents. Anarchy's sheets are
  unchanged; with Neon picked, an Anarchy runner prints Printer-friendly.
- Settings shows the printed sheet style you last picked, even when you changed it on the print page.

## 0.9.8 — 2026-10-05: rules contents, example characters checked, circuit board as default art

Shadowrun 6's example characters (the core rulebook's ten archetypes, Smooth Operations' six faces) were checked
against their stat blocks, the way Anarchy's were in 0.5.4 and 0.5.6: an example character is what its book prints.
Our own mistakes are fixed; what the book prints against the rules now shows on the runner's Review tab.

**Review**
- A book sample keeps the numbers its stat block prints: attributes (natural and augmented), Essence, initiative,
  condition monitors and Defense Rating. Where the rules give another, Review notes it with the book's page, such as
  "REA: the book prints 4(6); the rules give 4(7)". Nothing in the file corrects the book. Over budget, a skill above
  the cap, an expertise at creation, a seventh quality and the like show as on any runner.

**Rules**
- Built Tough adds a box per level to the Physical condition monitor (CRB p.70); a troll or ork read a box or two short.
- Dermal Deposits adds 1 to the Defense Rating (CRB p.71).
- A ware's bonus can go to the Defense Rating (dermal plating, bone lacing), as well as to an attribute or initiative
  dice.
- Both qualities are named by creation settings under Derived values (the standard settings name the core rulebook's).
- A value printed without its leading 0 (dermal plating's Essence, "Rating x .3") reads; it counted 0 with a warning.
- A quality whose levels are printed in its name's note, Addiction (Substance, 1 to 6), takes those levels; level 3 read
  "above its highest level".

**Imported examples** (import the core rulebook, then Smooth Operations, again to get them)
- Smooth Operations' faces find what they list in the core rulebook's catalog (metatype, skills, qualities, gear); nearly
  all of it read "not in the catalog".
- Each item as printed: bone lacing (titanium) is titanium, not plastic; a cyberarm or cyberhand printed with its kind
  is that limb (its Essence counts); Spirit Bane and Spirit Affinity, a combat knife and stealth tags find their catalog
  entries; a grade printed with an implant (alpha) is its grade; gear listed under Gear is never an implant.
- No more wrong look-alikes: a combat knife was bought as a combat axe, the Face's custom Colt Manhunter as a Colt
  America, a Beretta 201 as a Beretta 101T at rating 201. What the catalog doesn't have stays in the notes.
- Wired reflexes, reaction enhancers, muscle toner and augmentation, Improved Reflexes, dermal plating and bone lacing
  carry the bonuses they give, so augmented attributes, initiative and Defense Rating compute as the rules give them.
- Knowledge skills and languages past Logic's points are bought with karma instead of overspending the points.
- Each example now has its priorities: of the 120 ways to give A–E to the five columns, the one that overspends least
  for what the book prints. Magic and Edge go on adjustment points, then the metatype's raised attributes; what the
  attribute, adjustment and skill points can't hold is bought with karma, the cheapest ranks first, and nuyen past the
  resources with karma turned into nuyen. Ties go to the one whose nuyen left is nearest the printed starting nuyen.
  The budgets were all overspent with no priorities; Review now shows only what the book's build really overspends.

- **Rules opens on a table of contents** (both games). The page lists every rule title, by sheet on Anarchy and by
  chapter on Shadowrun 6; the book, sheet or chapter and search boxes narrow the list. Click a title and the rule slides
  out from the side with its own address (#/rules/… on Anarchy, #/sr6/rules/… on Shadowrun 6), so a reload or a shared
  link opens the same rule. Esc or Close goes back to the list. A Shadowrun 6 section links to its subsections, and on
  Anarchy the Edit button and the Edited mark are on both the list and the rule.

- **The Shadowrun 6 circuit pattern is now a default background image.** The pages no longer draw it themselves: they're
  a plain page, and the circuit board comes as a background image in the Shadowrun 6 gallery, on from the start. The
  admin can hide or delete it in Settings → Background art (Shadowrun 6) like any upload, and once deleted it doesn't
  come back. Uploaded art shows cleanly, with no pattern over or under it, and each browser can still turn background
  art off (Settings → Background: Plain page).

## 0.9.7 — 2026-10-05: neon Shadowrun 6 colours, background art shows again

- **Shadowrun 6 is neon, mostly cyan.** Titles, outlines, buttons and the logo tag are neon cyan; neon pink comes second
  (the hatched rule under titles, the current tab, hovers and focus), with violet as a third. OK is neon green, warnings
  orange, errors neon red. The dark look is blue-black with bright neon; the light look uses deeper cyan and pink so the
  text stays readable. The printed sheet follows: cyan boxes and titles, a pink rule under the name.
- **Your background art shows again on Shadowrun 6 pages.** The circuit-board pattern was drawn over it; now, when an
  admin's background art is shown, it replaces the pattern. With the art turned off, the pattern is back.
- **The NPCs and Critters tabs are bigger**, so the Critters section is easy to find (both games).

## 0.9.6 — 2026-10-05: NPC and Critter sections, Shadowrun 6 look, shared compendiums

- **NPCs & Critters has two sections: NPCs and Critters** (both games). Each is its own tab with how many it holds, its
  own search and its own address (#/sr6/npcs and #/sr6/npcs/critters on Shadowrun 6, #/npcs and #/npcs/critters on
  Anarchy), so a link or a reload opens the same one. On Shadowrun 6, NPCs holds grunts and contacts, Critters holds
  critters, spirits and sprites; on Anarchy, NPCs holds NPCs, Critters holds critters and spirits. The section's button
  is **New NPC** or **New critter** and offers only that section's kinds, and closing an NPC's editor goes back to its
  section.
- **The Shadowrun 6 lists are grouped**: grunts by Professional Rating, then contacts, critters, spirits by Force and
  sprites by Level, each group with its count.
- **Load book NPCs shows it's working.** The button is greyed out while it runs and the status line counts
  ("Loading book NPCs: 120 of 450…") with a progress bar. When it's done it sums up: how many loaded, how many were
  already there, how many versions got a number (Shadowrun 6) and how many failed, with each failure listed underneath.
  It saves four at a time, so a long list loads faster without swamping the server. **Tidy book copies** counts the
  same way.
- **Augmentations keep their real type.** Body Shop's geneware, nanoware, symbionts and transgenic infusions import as
  those types (they were filed as bioware or cyberware). Game data and the augmentation picker group them by type and
  category. Only cyberware and bioware take a grade. Re-import Body Shop to get the new types. The Foundry export still
  sends them as bioware (nanoware as cyberware), with the printed type beside it.
- **Implant grades are catalog entries.** The core rulebook's grade table and Body Shop's omega grade, exoware
  (cyberware only) and gammaware import as **Augmentation grades** on Game data, and the augmentation grade picker
  offers them with their Essence and cost factors (gammaware prints no price, so it isn't offered). The standard
  grades' numbers on Table setup still apply and can change any grade's factor. Re-import the core rulebook and Body
  Shop.
- **Autosofts can be bought.** The core rulebook's autosofts (Clearsight, Evasion, Targeting…) import as programs priced
  by the book's rating formula, and programs and autosofts can now be bought on **Gear** (at a rating) and fitted to a
  vehicle or drone. Double Clutch's skill autosofts (Biotech, Con (Performance)…) import as programs too, with their
  ratings (the book prints no price for them).
- **NPCs that share a stat block are all imported.** Where a Shadowrun 6 book prints one stat block for two names
  (Final Bets' Houngan/Mambo, Slip Streams' Government Agent/Corp Troubleshooter), two beings in one band (Missions'
  Saeder-Krupp Guard and Combat Mage, The Third Parallel, Collapsing Now) or several beings in one box (Lethal
  Harvest's chimeras), each now loads as its own NPC with its stats, instead of only one (or one with mixed stats).
  Re-import those books, then **Load book NPCs**.
- **Lifepath follows Born This Way.** Attributes whose metatype maximum is above 6 start at 2, and a runner who is
  neither awakened nor emerged gains 1 Edge (both on Table setup). Karma can no longer raise a contact's connection or
  loyalty above your Charisma: what is above it must come from the modules' contact points.
- **Metavariants can be picked in priority creation.** Once the Sixth World Companion is re-imported, each
  metavariant is offered at the metatype priorities its development table allows, with its own adjustment points, and
  its karma comes out of your starting karma.
- **Only a GM approves a rule problem** (both games). Players no longer see **GM approve** on Review. A GM (an editor)
  or the admin approves, or revokes, a problem on a player's runner from its read-only view, when the runner is in a
  campaign they run; the player sees it on their next load. Their own runners they approve as before.
- **More months of the same lifestyle add up.** A Lifestyle spend on the Shadowrun 6 Ledger for the lifestyle the
  runner has adds its months (3 months, then 2 more: 5); another lifestyle replaces it.
- **An accessory's rating can be changed in place** on a Shadowrun 6 runner (and its grade, where it takes one).
- **Importing a runner or an NPC right after opening the list** no longer fails with "changed elsewhere" when its id is
  taken: the copy gets a new id (both games, Your runners and NPCs & Critters).
- **Players' runners can use the GMs' compendiums** (both games, each game's own). A compendium shared with the table
  is offered to every player's runners; one shared with a campaign, to the runners in that campaign. Private ones stay
  with their GM. In the pickers a compendium's entries carry a **House** chip with the compendium's name.
- **Players read, never edit.** Players get the shared entries through a read-only route (`/api/compendiums/shared`,
  `/api/sr6/compendiums/shared`); a compendium's NPCs are never sent to them.
- **A runner keeps what it took.** A runner keeps its own copy of every compendium entry it uses (an Anarchy vehicle its
  chassis; an SR6 runner its qualities, powers, gear and lifestyle), so it still prices, prints and exports the same
  when the compendium is unshared or deleted. Review then notes that the entry's source is no longer available.
- Exports (runner file, Foundry export) carry those copies, so the importer and the Foundry module still get the
  entries' data.
- **Shadowrun 6 has a look of its own**, light and dark: every Shadowrun 6 page takes the core rulebook's style (white
  page, magenta section titles in wide capitals, rounded magenta-outlined panels, grey sidebars, a faint circuit-board
  background and a "SHADOWRUN 6 // RULES" line at the foot of the page); dark mode is deep purple with neon magenta and
  teal. The printed Shadowrun 6 sheet echoes the official sheet (rounded magenta boxes, Edge points as hexagons). The
  **Choose your game** page shows each game in its own style. Anarchy's pages look exactly as before.
- **Each game's sheet art is its own.** A Shadowrun 6 sheet's Background switches, strength and image pick are kept
  apart from Anarchy's: turning the art off on one game's sheets leaves the other's as it was.

## 0.9.5 — 2026-10-05: one copy of each book NPC, numbered versions

- **A book NPC printed in several Shadowrun 6 books loads once, or numbered.** Load book NPCs on **NPCs & Critters**
  now compares the same NPC, critter, spirit, sprite or contact across books (the same kind and name, whatever the
  case or punctuation). If the stat blocks are the same, only the copy from the book that came out first loads. If
  they differ, each version loads, named "Fuzzbeast #1", "#2" and so on in the order the books came out (a book that
  repeats an earlier version shares its number). Pressing it again still adds nothing.
- **Tidy book copies** sorts out the copies you already loaded. When your NPCs hold such copies, a note above the list
  offers **Tidy book copies**: it lists what moves to the NPC trash (a copy the same as one that stays) and what gets
  renamed with its number, and does it only when you confirm. Only copies unchanged since they were loaded count: NPCs
  you made or changed are never touched, and anything moved can be restored from the NPC trash.
- **Every Shadowrun 6 book now has a publication month** (and its Catalyst product number), which sets that order.
  The core rulebook counts from its first printing (August 2019); each City Edition from its own release. Where a book
  gives only its copyright year, the month is a best guess.

## 0.9.4 — 2026-10-05: one entry per book file, clearer import status, City Edition chapters

- **Uploading a book again replaces its row instead of adding one** (Anarchy and Shadowrun 6 **Books**). If the file is
  the same PDF as a book already in the list (the very same file, whatever its name), that book is imported again in
  its own row, whether it had failed, imported, been skipped or superseded. A different file, such as another printing,
  is still a book of its own. A book the AI read keeps its entries; uploading it again changes nothing. While the book is
  still busy the upload is refused with a message: try again when it's done.
- **Books uploaded more than once are tidied up when the server starts.** For each file uploaded several times, one row
  stays: the newest that imported (or was skipped or superseded), else the newest. The other copies are removed, with
  their PDFs; what the kept one imported stays in place. The server's log says which were merged. On a Shadowrun 6
  server this tidies Street Wyrd and the Hong Kong core rulebook, which were listed twice.
- **A book waiting or importing says so in its row.** It shows **Waiting** until its turn, then **Importing…** with
  the step it's on (or **Removing**), instead of its last state and error. If the new import fails, its own error shows.
- **City Edition chapters count as imported.** The Hong Kong, Seattle and Berlin chapters of the core rulebook now show
  **Imported** in the Shadowrun 6 **Supported books** list once their printing is in (a superseded printing still gives
  its chapter), and they get their own entry in the imported sources list, with their name. Press **Re-import** on each
  City Edition imported before this build to add that entry; a superseded printing imported before city chapters were
  read (0.9.1) picks up its chapter the same way and stays superseded.

## 0.9.3 — 2026-10-05: Shadowrun 6 import fixes

- **Six Shadowrun 6 books failed to import in 0.9.2** (Street Wyrd, Deadly Arts, Hack & Slash, Lofwyr's Legions,
  Ingentis Athletes and Johnson 'Dex) with an AttributeError; they import again. Press **Re-import** on each.
  Every SR6 PDF was run through the importer before this release: 56 books import, the rest are skipped.
- **Files with nothing to import no longer show as failed** on Shadowrun 6 **Books**. The Gun Rack and Rides card
  decks (reprints of the books' entries), the Seattle Metroplex map, Adversary (fiction), the Gamemaster's Screen
  (images only), the errata PDFs (applied with their book) the fillable character sheet and the Beginner Box handouts (quick-start rules,
  dossiers, cards, map; its Battle Royale adventure still imports) are recognised and marked
  **Skipped** with the reason, in grey, and can still be removed. A PDF the app doesn't know still fails as before.
- **Only the latest printing of the core rulebook is used.** If you import more than one printing (Current Printing
  2019, Berlin, Seattle 2021, Hong Kong 2025), the newest is the one loaded; the others stay in the list marked
  **Superseded by** the newer one, and their entries aren't loaded. Remove the newest and the next newest is loaded
  again on its own. Each City Edition's city chapter is still loaded from its own book, whichever printing is in use.

## 0.9.2 — 2026-10-04: every Shadowrun 6 book, Sixth World Companion and lifepath

- **The Sixth World Companion can be imported** on Shadowrun 6 **Books** (it is now in the supported list). From your
  copy of the book the app reads its life modules (the three opening ones and the 86 adult choices and events, with
  what each gives: attribute and skill choices, nuyen, contact points and the contact types they're for, knowledge
  skills), its 25 metavariants and metasapients with their attribute ranges and racial traits, its qualities (the new
  positive and negative ones, the metagenic and infected ones), its new critter powers, its contacts with their stat
  blocks, and its rule sections. What it couldn't read is listed in the import's report. Lifepath can be picked once the
  life modules are in.
- **Lifepath follows the Companion's rules.** Pick your best attribute on Creation method: it goes up by 5, up to your
  metatype's maximum, and if the maximum stops it you pick where the rest goes. One adult module may be taken twice
  (**Add again**), each copy with its own choices. On Contacts, give each contact one or two types: each module's
  contact points only go to contacts of its types, and connection or loyalty past your points costs 1 karma a rating.
  Your metatype's karma (a metavariant's) comes out of your starting karma, as in point buy.
- **Metavariants work in point buy and lifepath** straight away: their karma costs ship with the standard creation
  settings (with the Companion’s page), next to the new lifepath numbers; once the book is imported, Table setup shows
  them and lets you change them.
- **Better reading of some PDFs.** Books whose text columns sit very close together, or whose bullets are set small and
  raised, no longer come out with the two columns mixed. Re-importing the core rulebook gives the same entries.

- **The Contacts table fits the page.** With lifepath's contact types, the two type boxes no longer pile up in their
  cell, push **Remove** out of sight or make the table scroll sideways: they sit side by side, and where the page is
  narrow (a phone, or a small window next to the build panel) each contact shows as a small card with its fields labelled.

- **Shadowrun 6 books with doubled letters read properly.** Some PDFs (Falling Point, Final Bets, Scotophobia, Shoot
  Straight, Tarnished Star, The Needle's Eye, Wild Life) carry every page's text twice, which came out as
  "IInnttrroodduuccttiioonn". The importer now keeps only the first copy, headings included, while real double letters
  ("Arrow", "Kill") stay. Words broken after an "fi", "fl" or "ff" ("fi rst", "offi ce") are joined again where the
  result is a word; "off the" stays two words. The core rulebook imports exactly as before.

- **The core rulebook's City Editions import** (Hong Kong, the latest printing, and Seattle and Berlin): the importer
  recognises them and reads them as it reads the 2019 printing, with their updated values. Names no longer keep a
  footnote mark ("Flash-pak*").

- **Firing Squad can be imported** on Shadowrun 6 **Books** (it is now in the supported list). From your copy of the
  book the app reads its weapons (with their weapon modifications and accessories), ammunition, armor (each variant
  of a suit on its own) and armor modifications, tac-apps, the trauma qualities, the security and gang NPCs and the
  rule sections, martial arts included. What it couldn't read is listed in the import's report. The book's errata
  sheet isn't applied: it changes rules as well as numbers, so the book's printed values are kept.
- **Firing Squad: the eight Vashon Island suits are read,** and a quality priced by variant (Phobia: by rarity) keeps its lowest and highest karma instead of only the first number.
- **Wild Life can be imported** on Shadowrun 6 **Books** (supported list): its critters with their stat blocks (172, each with its habitat), the new critter powers (Fragile and Carrier marked as weaknesses), critter gear and the rule sections; a stat band whose header shares a line with the next column's label (Firing Squad's Street Veteran) is read too.
- **Bestial Nature can be imported** on Shadowrun 6 **Books** (supported list): the Shifter quality's four forms and its 34 positive and negative add-ons (as qualities), the 13 Animalism powers (as metamagics), its armor, gear, silver bullets and drones, and the rule sections.
- **Smooth Operations can be imported** on Shadowrun 6 **Books** (supported list): its spells, ritual, adept powers, metamagics and alchemical preparations, its social gear (clothing, armor modification, accessories, apps, espionage gear), its qualities, its six faces as sample runners, and the rule sections.
- **Explosive Decompression can be imported** on Shadowrun 6 **Books** (supported list): its spacesuits, space gear and energy weapons, its thruster packs, spaceships, starships and drones, the mission rosters' NPCs, and the rule sections.
- **The other Shadowrun 6 books can be imported** on Shadowrun 6 **Books** (supported list), with one general reading: 30 Nights, Assassin's Night, Collapsing Now, Cutting Black, Dealers of Death, Echoes of a Lost Signal (and its QSR edition, fan scenarios), Emerald City, Falling Point, Final Bets, Free Seattle, Lethal Harvest, Los Alamos: The Secret City, Margin Calls, Missions Legends 2083-03 and 2083-04 (Nile Gambit), Neo-Anarchist's Streetpedia, Null Value, Power Plays, Risks & Rewards, Scotophobia, Shadow Cast, Shadows in Focus: New Orleans, Shoot Straight, Slip Streams, State of the Art 2084, Tales from the UCAS: Age of Rust, The Kechibi Code, The Needle's Eye, The Third Parallel, Whisper Nets, the Beginner Box's Battle Royale adventure and the character conversion guide: their NPC, grunt and contact stat blocks (with their Professional Rating), critters, priced gear, weapon, armor and vehicle tables, qualities, life modules and rule sections. Wild Life's trojan rat and Explosive Decompression's ArmTech grenade launcher are read too, and a stat block's second R is read as Resonance.

- **Deadly Arts can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its weapons (one entry
  each from the shared weapon boxes), weapon mods, vehicles and drones, armor and armor mods, implants, comm gear,
  ammunition and other gear, spells, adept powers, metamagics, rituals, qualities, its martial art styles and
  techniques (a new kind on Game data, which Firing Squad's import now fills too) and the rule sections.
- **Hack & Slash can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its matrix gear
  (cyberhacks, dataterms, deck cases, components and mods, data taps, tag bombs, commlink hacks and apps, agents,
  cyberkits, codemods), cyberprograms, complex forms, echoes, sprites, qualities, the matrix security NPCs and the rule
  sections (hosts, IC, foundations and resonance realms among them).
- **Street Wyrd can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its spells, adept
  powers, metamagics, traditions (a new kind on Game data), preparations, spirits and spirit powers, qualities and
  the rule sections.
- **Matrix programs are a kind of their own** on Game data (grouped basic and hacking): the core rulebook's import
  lists each program with its type's availability and price, Hack & Slash's its new cyberprograms (the book prints no
  price for them).
- **Lofwyr's Legions can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its Saeder-Krupp
  NPCs, the drake qualities and drake powers, its martial art and the rule sections.
- **Johnson 'Dex can be imported** on Shadowrun 6 **Books** (it is now in the supported list): each Mr. Johnson card
  becomes a contact (with its bio, plot hooks, gear level and favors) and an NPC with its stats, plus the deck's rules.
- **Ingentis Athletes can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its ten troll
  athletes as NPCs (read from the book's stat lines), the one priced weapon among their gear, and the troll variant rules.
- **Body Shop can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its cyberware, cyberlimbs and their enhancements, bioware, geneware, nanoware, symbionts, nanotech and drugs, the implant weapons, the augmentation qualities, the augmented critters and the rule sections (the new implant grades among them); what it couldn't read is listed in the import's report.
- **Double Clutch can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its vehicles and drones of every class, the vehicle modifications (gear entries now carry their modification slots), weapon mounts, drone racks and trailers, the rigger headware, the gear-head qualities, its sample contact and the rule sections; what it couldn't read is listed in the import's report.
- **Krime Katalog can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its weapons, grenades and weapon accessories, ammunition and vehicles, each with its Sixth World stats (the Fifth Edition ones printed beside them are left out); what it couldn't read is listed in the import's report.
- **Double Clutch: no vehicle goes missing.** The DSEC, the Krime Karrier and the GTI Revolution now import; an aircraft the book's summary table lists but the importer couldn't read is listed in the import's report.
- **No Future can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its gear (instruments, the yo-yos, rolling blades and other weapons, hats and coats, the two media vehicles, cameras, presses, the cybersenses), its qualities and its rules for performing; the availabilities from its errata sheet are applied, its other errata (rules and re-rated cyberware) aren't. What it couldn't read is listed in the import's report.
- **Tarnished Star can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its weapons (the Foamtek line among them), ammunition, shields, armor and helmets, police gear (badgecams, inhibitor bands, scanners, drugs), its vehicles and drones, the Roll Call archetypes, contacts and security NPCs, and its rules for working a case, interviews and blackmail. What it couldn't read is listed in the import's report (two bikes whose stats run together in the book).
- **Astral Ways can be imported** on Shadowrun 6 **Books** (it is now in the supported list): its spirits (the elemental denizens, the dinosaur spirits, a toxic spirit), critters (chimeras, golems, toxic horrors), NPCs, the airships and their weapons, the astral devices and encounter suits, its new spell, rituals, critter power, metamagic and quality, and the rules from each metaplane's game information and the techniques of travel. What it couldn't read is listed in the import's report.
- **The City Editions' city chapter imports too**, as a source of its own (Seattle, Berlin or Hong Kong, now in the supported list), beside the core rulebook and without changing it: the city's qualities, its contacts with their stat blocks, its gear, weapons and vehicles, and its plot hooks and rules. What it couldn't read (a few contacts whose stat blocks print into each other) is listed in the import's report; removing the book removes it too.

## 0.9.1 — 2026-10-04: Shadowrun 6 fixes, Table setup, two-row header

- **Rules text reads like a book again.** Shadowrun 6 rule sections and descriptions were squeezed into a narrow
  column, with the PDF's line breaks, words split across lines ("gamemas- ter") and `**bold**` markers showing. The
  importer now joins each paragraph's lines, rejoins a word split at a line end (real hyphens such as "non-player"
  stay) and starts a new paragraph where the book did, keeping list items, tables and label lines on lines of their own.
  Re-import the core rulebook on **Books** to get the cleaned-up text; until then the old text is still shown as joined
  paragraphs. The Rules and Game data pages show **bold** and *italic* as such, paragraphs and lists across the page's
  width up to a comfortable line length; each Game data entry with a description has a **Description** to open.
  Anarchy's texts already came in whole paragraphs and are unchanged.
- **Game data is browsed by book and category**, in both games. At the top, a **Book** list: All books, or one
  imported book or compendium. Then the kinds of entry, each with its count (a list beside the entries; tabs across the
  top on a phone): pick one and only its entries show. Big kinds split into sub-categories you can pick: Shadowrun 6
  weapons by type, augmentations by cyberware or bioware and body area, spells by category, gear by its section of the
  book, qualities positive or negative, rules by chapter; Anarchy amps by type, weapons, gear and spells by category,
  skills by attribute, rules by sheet. Anarchy's Game data gets the browser for the first time (amps, amp effects,
  weapons, armor, gear, spells, complex forms, skills, metatypes, vehicles, packages, lifestyles, rules), with the Edit
  buttons for amps, items and rules. **Search everything** looks across every kind at once and groups what it finds by
  kind. The sources, Foundry export, your catalog edits and the file lists follow below.
- **Rules** (both games): a **Book** list at the top, next to the chapter list (Anarchy: the sheet list) and the search.
- **The header has two rows of icons**, the same way in both games. Row 1 is the main menu, identical on every page of a
  game and always in the same order: Your runners, NPCs & Critters, Compendiums, Campaigns, Books, Rules, Game data and
  Table setup (only the pages your role can use), then the game switch, Ask the rules (Anarchy), Settings and your
  account. The page you're on is underlined. Row 2 appears only on a page that has its own actions and holds just those:
  New runner, Import file, Export for Foundry, Load example characters or Load book NPCs, Find duplicates and Trash on the
  lists; Save, Undo, Redo and the exports in a runner's editor; Print, Sheet type and Background on the print page (which
  now has the main menu too, never printed); a compendium's export. Every icon names itself in a tooltip above it. On a
  phone the rows wrap; the page never scrolls sideways.
- **SR6 creation rules come filled in with the standard values.** A new server no longer starts with an empty creation
  rules form: the app ships the core rulebook's numbers (starting karma, caps, karma prices, nuyen rates, augmentation
  grades and the rest) and the Sixth World Companion's for **sum to ten**, **point buy** and **lifepath**, each with its
  book and page. Priority, sum to ten and point buy can be picked straight away; lifepath once its life modules are in
  the catalog. **Karma build** stays locked until you enter its numbers, because no SR6 book prints them. On **Table setup**
  a new **Standard** column shows each standard value and its page, marks the ones your table changed, and has **Reset**
  for one value and **Reset all to standard**. Saving keeps only what you changed; everything else follows the standard.
  If you saved a full set of settings before, it keeps working as it is. A campaign's own settings still start as a copy
  of the server's.
- **Load book NPCs on SR6 NPCs & Critters now loads the whole book**: the critters, spirits and sprites as well as the
  grunts and sample contacts, each once (pressing it again adds only what's missing). Spirits come in at Force 3 and
  sprites at Level 3, a starting point you change on the NPC's Stat block tab. The sample contacts are their own kind
  now, **Contact**, instead of showing as "Grunt · Contact"; contacts you loaded with 0.9.0 are switched over the next
  time you press Load book NPCs. New NPC lists contacts under Contact. In a Foundry export a contact goes out as an NPC
  (a grunt with group Contact). Players still never see NPCs.
- **SR6 example characters**: importing the core rulebook now also reads its archetypes (the sample characters) as SR6
  runners, and **Your runners** has **Load example characters** to copy them into your list, each once. Each one is built
  from its printed stat block: metatype, attributes, skills with specializations, knowledge skills and languages,
  qualities, spells, adept powers, complex forms, contacts, lifestyle, gear, augmentations, vehicles, weapons and fake
  SINs, matched to the book's entries by name. What the app can't hold (augmented values, the printed initiative,
  condition monitors and starting nuyen, and anything not found in the book's tables) is listed in the runner's Notes.
  Priorities aren't set, so the budgets show overspent until you choose them. On the owner's copy of the core rulebook
  all ten archetypes import. Re-import the core rulebook to get them.
- **Load settings file** on the SR6 creation rules form (the server's on Table setup, and a campaign's own on its page): pick a
  `creation.xml` from your computer (the format of `custom/sr6/creation.xml`). It is checked and its values fill the form,
  in place of what it showed, for you to review; anything it couldn't use is listed. Nothing is saved until you click
  **Save creation rules**. A file of another kind is refused.
- **Table setup**: a new page in both games (sliders icon in the header; `#/table` and `#/sr6/table`) for how the table
  plays, so Rules and Game data show only book content. Anarchy: the table switches (non-canon content, real SINs, the
  books' optional rules and house rules) move there from Rules. Shadowrun 6: the creation rules move there from Game data;
  the admin edits the server's settings, with **Load settings file** and links to campaigns that have their own. Admin and
  editors use it; players see what's in effect, read only (Anarchy's former Table rules page; old links still work).
- **A campaign can have its own SR6 creation rules.** The admin's settings are the server's default. On an SR6
  campaign's page its GMs (and the admin) choose **Use the server's settings** or **Use this campaign's own settings**,
  which starts as a copy of the server's to change and save. Runners in that campaign are built, checked and priced with
  its settings (budgets, Review, the career ledger, Foundry export); every other runner uses the server's. The campaign's
  players see its settings read only; nobody else sees them. Only the admin can change the server's settings now (editors
  could before); editors set their own per campaign.
- **Shadowrun 6 has its own background art.** The SR6 side's app background, printed sheet and the sheet's Background
  picker use only SR6 images; Anarchy keeps its own. The admin uploads SR6 art the same way as Anarchy's: open **Settings**
  while on an SR6 page and use **Background art (Shadowrun 6)** (PNG, JPEG or WebP, 10 MB each, 50 at most). The app ships
  no art.
- The first screen shows **Shadowrun 6th World** first, on the left; Anarchy 2.0 is second.

## 0.9.0 — 2026-10-04: Shadowrun 6th World

The app now builds runners for two games. Everything below is the Shadowrun 6 side; Anarchy works as before.

**Game picker**
- A first screen chooses **Shadowrun Anarchy 2.0** or **Shadowrun 6th World**; this browser remembers it, and the game
  icon in the header switches at any time.
- The two games are kept fully apart: runners, NPCs, campaigns, compendiums, books, imported data, catalog edits, trash
  and settings are each game's own. The server refuses an object from the other game (an SR6 runner in an Anarchy
  campaign, an Anarchy file in the SR6 store, the other game's file in a trash or compendium). Accounts and roles span
  both; a rename moves both games' folders, a delete retires both. SR6 data lives in `characters/sr6/`, `custom/sr6/`
  and `library/sr6/`; existing Anarchy data stays where it was. One backup holds both games. The username `sr6` is now
  reserved; an older account with that name keeps working, and the SR6 area waits until it is renamed.

**SR6 books, rules and game data**
- **Books** (admin): upload the Shadowrun 6 core rulebook PDF. It is converted to markdown, each item's stat-table row
  is regrouped with its description, and a recipe writes the SR6 catalog (priorities, metatypes, skills, qualities, all
  gear kinds, vehicles and drones, spells, rituals, adept powers, complex forms, critters, spirits, sprites, NPCs,
  lifestyles, contacts, rule sections). Anything unpaired or unread goes to the import report, never guessed.
- **Rules**: the book's rule sections, searchable. **Game data**: browse the catalog; the admin and GMs correct entries
  (kept across re-imports) and fill in the **Creation rules**, the numbers the book prints only in its text, each with
  its page. The app ships none: a method whose settings aren't set can't be picked and says what's missing.

**SR6 builder**
- All five creation methods: priority, sum to ten, point buy, karma and lifepath (lifepath once a book with life
  modules is imported). Itemized budgets, editor tabs from Concept to Ledger, derived values from the engine, a Review
  tab listing every broken rule with its page, and a printable SR6 sheet.
- Runners import and export as `sr6:character` XML (`docs/sr6-character-format.md`); an Anarchy file is refused with
  where it belongs, and a damaged file can be repaired.

**SR6 career, NPCs and campaigns**
- **Finalize** starts career play through the karma and nuyen ledger: earnings, advances and purchases at the prices
  in Creation rules. Append-only: a mistake is voided, never edited; **Back to draft** until something is earned or spent.
- **NPCs & Critters** (GMs): grunts by Professional Rating, critters, spirits and sprites with their stats at their
  rating, **Load book NPCs**, sharing with a campaign's GMs, their own trash. Players never get NPC data.
- **Campaigns**: SR6 campaigns of their own; only SR6 runners and NPCs join them.

**SR6 compendiums**
- GMs make their own collections of SR6 entries and NPCs, each under its own source id: private, shared with an SR6
  campaign's GMs, or the whole table. Copy entries in from a book (stats only, never the description), move NPCs in
  and out. A GM's pickers, Game data and New NPC dialog offer the entries of every compendium they can read; a
  compendium never replaces a book's source or entries. Players get no compendium routes, menu entry or entries.

**SR6 export for Foundry**
- SR6 runners, NPCs, books and compendiums download as Chummer SR6 export v1 (`docs/sr6-export-format.md`, schema
  `public/data/schema/sr6-export.schema.json`) for the new Chummer SR6 importer module in Foundry VTT
  (shadowrun6-eden, [jbowensii/chummer-sr6-foundry](https://github.com/jbowensii/chummer-sr6-foundry)).
- **Export for Foundry** in the SR6 editor and on each NPC row; **Export for Foundry…** on the SR6 runner list and NPCs &
  Critters (tick runners, All/None or a campaign); **Export book data for Foundry** on SR6 Game data (admin and GMs,
  descriptions on by default); **Export for Foundry** on an SR6 compendium's page.
- Every number is the app's own (attributes, Essence, prices at grade and rating, an NPC's stats at its rating); each
  entry also keeps its printed values. Anarchy's export is unchanged.

**Fixes**
- A request body whose character root never closed made the server spend minutes (quadratic pattern matching) before
  refusing it, on both games' runner and NPC saves; it is now refused at once, and such a body gets a 400, not a 500.
- A server stopping (a restart, an update) no longer starts the next queued import step or book after killing the
  running one.

**Still to do with the owner's real book (local only, nothing committed)**
- Import the real core rulebook (`python -m importer sr6 check "<PDF>" --out %TEMP%\sr6-check`): check the chapter
  names the recipe looks for, the label names (Linked Attribute, Untrained, Keywords, Cost), the priority cell formats
  and a grunt box printed right under its Professional Rating heading; review the unpaired rows and descriptions and
  add aliases (names only).
- Fill Game data → Creation rules from the book with pages, then build one runner per supported method to zero errors
  and check the derived-value formulas and their pages.
- Career: one runner through five spends against a hand calculation; the Magic/Resonance cap after initiation, adept
  power points after creation and how division rounds in spirit and sprite stats (code marked "verify (Task 10)");
  every book grunt loads and prints; one spirit and one sprite of each kind read without a warning at two ratings.

**Still to do in Foundry (chummer-sr6-foundry)**
- Reinstall Foundry 13 and 14 with shadowrun6-eden and Quench, and run the module's Quench batches (read, runner,
  replace, NPCs, books, compendiums, icons) before its first release; publish the public repo once the owner agrees.

## 0.8.4 — 2026-10-04: Server fixes

- A malformed save could stall the server: a runner or NPC file whose first tag never ends (a broken or hostile
  upload) took the server seconds to minutes to refuse, and nothing else was answered meanwhile. Any signed-in
  account could send one. Such a file is now refused at once.
- Stopping the server now stops book imports properly: an import step that ended just as the server stopped, or the
  next book in the queue, no longer starts anyway.
- A test that sometimes failed on a busy machine (the data pack start-up check waited a fixed 300 ms) now waits for
  what it expects.

## 0.8.3 — 2026-10-02: Duplicates by name, left-aligned icons, print fixes

**Find duplicates**
- Finds copies of the same runner (or NPC) by **street name, real name and metatype** (any case, extra spaces
  ignored), however much else differs: an example loaded twice from two versions of its file, or a copy you edited.
  0.8.2 only found exact copies, so it found none of those.
- Each character gets a box listing its copies with what tells them apart: when each was last edited, whether it was
  edited (saved again: rev 2 or more) or not, its chips (Draft or Finalized, Non-canon, Error) and its campaign. The
  copy to keep is picked to start with: an edited one over an unedited one, then the newest. Pick another, or **Keep
  every copy** for that character.
- **Move N to trash…** then lists the copies that will move and asks again; nothing moves before that. Everything
  goes to your trash and can be restored. **Tidy up** is unchanged.

**Menus**
- The icon row (the page's actions, the main menu, Ask, Settings and the account) sits on its own line under the
  title and starts at the left, on a computer and on a phone; the runner editor's too.
- Icons are 20% bigger (24 px in a 46 px square).
- **New runner**, **New NPC**, **New campaign**, **New compendium** and **Add account** are icons too (the page's own
  icon with a plus, in yellow), with their names in the tooltip; so is **Print or save as PDF**.
- Tooltips show **above** the icon, not under the pointer; below it only when there's no room above, and never past
  the edges of the window. They show over dialogs too.

**Printed sheet**
- **Sheet type** is back on the print page's toolbar (Printer-friendly, Full color, Book style; with a tooltip), kept
  in this browser as in Settings → Printed sheet. It went missing when the toolbar became icons in 0.8.1.
- No more near-empty pages: on the default sheet each block (Skills with Languages & knowledge, Wounds, Shadow Amps,
  the bottom columns, Background) was kept whole, so a Skills column taller than what was left of page 1 moved to
  page 2 and left page 1 with only the name and attributes. Blocks now break between rows (never inside a row, and
  never right after a heading). Checked as PDFs on Letter and A4 for the default and Book style.

## 0.8.2 — 2026-10-02: Tokens, spell categories and duplicates

**Token**
- A runner or NPC now has a **token** picture beside its portrait on the Concept tab, shown round. **Set a token…**
  opens the portrait's dialog (choose a picture, zoom, drag, center) with a round preview and **Same as portrait**,
  ticked by default: no token of its own, the portrait serves. Untick it to frame the portrait for the circle, or
  choose other art.
- The token is saved in the character file (`<token>`, after `<portrait>`; the XSD and the importer's writer have it
  too) and exported for Foundry as `runners[].token` (a data URL, or `null`: use the portrait). The Foundry module
  0.7.0 reads it.

**Export**
- A runner's items carry their catalog **category** (`items[].category`), as book items already did: a spell's
  combat, detection, health, illusion or manipulation. In the schema and docs/export-format.md.

**Duplicates**
- **Tidy up** finds more extra copies of the example characters: a copy loaded from an older version of a book's
  example file, recorded under the book's earlier canon flag, now pairs with the current one, and on the server a copy
  counts as unchanged while it's saved once (rev 1), whatever its dates. The newest unchanged copy stays; a copy you
  edited (saved again) is never moved.
- **Find duplicates** (an icon on Your runners and on NPCs & Critters, server only) lists your runners or NPCs that
  are identical apart from their ids, files and dates, by name, and moves the extra copies to your trash after you
  confirm. The one in a campaign stays, else the most saved, else the newest. Everything can be restored from the
  trash.

## 0.8.1 — 2026-10-02: Icon menus and a stronger sheet background

**Menus**
- Every page's header is now **one icon bar**: the page's own actions, then the main menu (Your runners, NPCs &
  Critters, Compendiums, Campaigns, Books, Rules or Table rules, Game data), then Ask the rules, Settings and your
  account. Each icon names itself in a **tooltip** on hover and on keyboard focus, and the page you're on is
  **underlined in yellow**. Only the pages your role can use are listed.
- The main menu is on **every page**, the runner and NPC editor included, so you no longer go back to Your runners to
  get anywhere. The editor's Save, Save and close, Undo, Redo, Export file and Export for Foundry are icons too.
- Primary actions keep their words: **New runner**, **New NPC**, **New campaign**, **New compendium**, **Add account**
  and **Print or save as PDF**.
- Tidied: the duplicate back links (Campaigns, Books, All compendiums, NPCs & Critters) are gone, since the main menu
  marks where you are; Game data and the setup page now have Settings; the trash count shows as a badge; the title
  no longer runs into the logo; the account button no longer stretches with your name (it's in the tooltip).

**Printed sheet**
- The sheet's **background art** sits behind one **Background** button: strength, on screen, print it and the image
  pick open in a small dialog (Escape or a click outside closes it).
- **100% now shows the image nearly whole**. The text keeps a soft wash of paper behind it so it stays readable, on
  both sheet styles. The default is 60%, a clear but quiet image; a strength you set before keeps its number.
- On a phone the sheet's logo no longer runs off the screen.

## 0.8.0 — 2026-10-02: Your own compendiums

**Compendiums (admin and editors)**
- A new **Compendiums** page for GMs and the admin. It needs the server. Players never see it.
- **New compendium** takes a name, its **own source id** and who can read it. The source id is fixed afterwards and
  can't clash with a book or another compendium.
- Add **amps, weapons, armor, gear, spells, complex forms and vehicles** from scratch, or **copy** one from a book.
  A copy gets a new id and your source, and does not carry the book's description; write your own.
- **Move NPCs** in from the NPCs page, and back out to edit them. A moved NPC waits in the NPC trash.
- **Sharing**: private, with the GMs of one campaign, or with all GMs. Shared compendiums are read-only for the
  others, who can copy from them.
- A compendium's entries show up in the catalogs (pickers and the Amp Builder) of every GM who can read it, marked
  House.

**Foundry**
- **Export for Foundry** on a compendium downloads it as its own compendium. It needs the Foundry importer
  module 0.6.0.

## 0.7.0 — 2026-10-02: NPCs and critters

**NPCs & Critters (admin and editors)**
- A new **NPCs & Critters** page holds your NPCs, critters and spirits, apart from your runners. Players never see it.
- **New NPC** picks a kind (NPC, critter or spirit) and a tier, then opens the runner editor in **NPC mode**:
  attributes can go outside the metatype's range, and a critter needs no metatype.
- **Regular** NPCs have no Edge; **prime** NPCs are managed like runners, with Edge.
- A **fighting spirit** setting (low, high or extreme) is kept on the NPC.
- The sheet (Review and both printed sheets) shows **average hits** and the fighting spirit.
- **Share with a campaign…** lets that campaign's GMs read and print an NPC (one campaign per NPC). **Unshare** takes
  it back.
- A campaign's page now lists its shared NPCs for its GMs and the admin, each linking to the NPC. Players never see
  them.
- Deleted NPCs wait in the **NPC trash** and can be restored.
- **Load book NPCs** copies the NPCs, critters and spirits found in the core rulebook import.
- NPC files can be imported (a runner file is refused) and exported.

**Foundry**
- Exports carry NPCs: the NPCs page's **Export for Foundry…**, and the book data file's NPCs.

## 0.6.2 — 2026-10-01: book export adds topics, metatypes and pregens

**Book data for Foundry**
- Every rule now gets a section. A rule without one gets its topic name (for example, the Conversion Guide's
  Technomancer rules).
- Each rule also tells its topic.
- The books' metatypes and their pregen/sample characters are included. A sample that can't be read is listed and
  skipped, and the rest still download.
- Every skill of a book, with its specs, is in the file (as before).
- The new parts need Foundry importer 0.3.0. Older importers ignore them.

## 0.6.1 — 2026-09-30: runner-list markers, print page 1, background picker, Book style sheet

**Runner list**
- A blue **User defined** chip marks runners you made yourself (copies of examples count).
- A red **Error** chip marks a runner that is overspent, with the amount: “Overspent by N¥”.

**Printed sheet**
- Languages & Knowledge now sit on page 1 under Skills.
- Bigger portrait, and the logo sits on the yellow paint swish.
- No forced page break; the sheet flows naturally.
- The sheet’s background image can be chosen per runner (kept in this browser): “Same as the app” or one of the
  admin’s images.
- **Settings → Printed sheet → Book style**: a one-page sheet laid out like the rulebook’s example, using free fonts
  and no book art. Long runners flow onto a second page.

## 0.6.0 — 2026-09-30: export runners and book data for Foundry VTT

**Runners**
- **Export for Foundry** in the runner editor downloads that runner as a Foundry file.
- **Export for Foundry…** on the runner list: tick the runners you want (**All** / **None**, or **Tick a campaign**)
  and download them together.

**Book data (admin and editors)**
- The **Game data** page has a new panel: tick books (Canon / Non-canon) and download their amps, items, vehicles,
  skills and rules as they are in your app, with your edits and house rules applied.
- **Include book descriptions** is on by default, with the note "For your own Foundry only. Don’t share this file."
- The table rules that are switched on go in the file. If they fail to load, the export refuses to build rather
  than leave them out.

**Files**
- Named `runners-YYYY-MM-DD.ca2foundry.json` and `books-YYYY-MM-DD.ca2foundry.json` (your local date).
- The format is written up in `docs/export-format.md`, with a JSON Schema.
- The Foundry importer module itself comes next (`jbowensii/chummer-anarchy2-foundry`).

**Fixed**
- The Game data page no longer says to flag non-canon on the Concept tab; that switch moved to the Rules page in 0.5.7.

## 0.5.7 — 2026-09-30: portrait window, table-wide switches, version in the header

**Portrait**
- **Add a portrait…** / **Change portrait…** on the Concept tab opens a window: choose the picture, zoom (slider or
  mouse wheel) and drag it into the square (arrow keys too), **Center**, **Remove picture**, and pick the backdrop
  with a live preview. Saved as a 384 px square (PNG when it has transparent parts, JPEG otherwise); a portrait left
  untouched is kept as it is.

**The GM's table rules**
- "Allow non-canon content" and "Has a real SIN" left the runner's Concept tab. On the Rules page the GM now has two
  switches for the whole table, both on until switched off: **Non-canon content allowed** and **Real SINs allowed**.
  Players see them under Table rules. When one is off, a runner's Review tab flags what uses it.
- A real SIN is the SINner quality: adding it on the Shadow Amps tab brings the free Real SIN entry on the Gear tab,
  removing it takes the entry away (kept when no book has a SINner). The house rule is unchanged: a SINner is always
  free and never the first Quality. After Finalize both are logged in the ledger, as before.
- A runner file's old canon-only mark is kept but no longer used: the table decides.

**Everywhere**
- The app's version shows after the logo on every page, sign-in too.

## 0.5.6 — 2026-09-30: example characters as printed

The owner's rule: every example character is what its book prints. What the book prints against the rules shows
on the runner's Review tab; nothing in the file corrects, explains or approves it. 0.5.4's adjustments are gone.

**Review**
- A book sample's amp keeps the rating its book prints. Where the rules give another, Review notes it: "Goliath
  Cyberarms: the book prints rating 5; the rules give 3" (Pregens p.11). Over budget, a Negative effect's GM approval,
  an Equipment amp with no printed item and the rest show as on any runner.
- "Book drawback" no longer approves anything: a Negative effect on a runner's own amp, a book sample's too, needs the
  GM. A catalog amp's own printed drawback, unchanged, still needs no approval, as before.

**Imported examples** (import the core rulebook and the pregen booklet again to get them)
- Amps as printed: the printed type (a deck printed as a Quality stays a Quality), the effects the lines read, a
  line no effect reads kept as the amp's text. No narrative effect is added, no Negative effect made up, no effect
  dropped or retyped to meet the printed rating.
- Items as printed: a branded commlink is bought like any gear (the app still adds the free commlink and fake SIN
  when it loads a runner, taking a printed plain "Commlink" and "Fake SIN"); gear an implant has built in and the
  equipment list prints is bought; an armor row "(+1)" is an armor of that total; an Equipment amp gets no item the
  page doesn't print.
- No overrides ("As printed in …"), no drawback notes, no starting or add-on markers in the files.
- Kept, as reading: dispositions and cues from the core rulebook's page layout, implanted weapons printed without a
  type, a weapon's astral row, a spec rolled with two attributes bought once.
- Catalog amps the rulebook prints only on its sheets are priced as before.

## 0.5.5 — 2026-09-30: Finalize locks nothing

**Finalize and the ledger**
- Finalize is now the last check of creation and a ledger entry: “Creation
  finished · N¥ left”. Nothing is locked afterwards. You change the runner on
  any tab as in creation. Adding something charges its price. Removing an item,
  an amp or a skill or attribute point gives its book price back to spend again.
- Every change after Finalize is logged in the ledger by itself, with what it
  cost or gave back, so the GM can follow it. Steps on one thing within ten
  minutes (Stealth 3 → 4 → 5) are one line. Undo works after Finalize too, up
  to the last recorded earnings.
- The balance is what creation left, plus earnings, minus each change at the
  price it had when made: re-importing a book or editing a price later never
  moves a balance, and the ledger's running total always matches it. The
  level-of-play creation caps apply only before Finalize.
- Reopening creation keeps what the balance held beyond budget minus build
  (an old sale that wasn't refunded, a price changed since), so reopening and
  finalizing again never makes or loses nuyen.
- Removing something after Finalize gives back what was paid for it (at
  creation or when it was added), not today's price; lowering gives back that
  share. A price raised since can't be turned into nuyen by removing and adding
  it again.
- **Reopen creation** is on the Review tab, next to Finalize, until earnings
  are recorded. The Review tab also shows the balance once finalized.
- Runners finalized before 0.5.5 convert when you open them. Their recorded
  changes become the build, the history and earnings stay in the ledger, and
  the balance stays exactly what it was (an item sold then, without a refund,
  stays that way).
- **Has a real SIN** can be ticked after Finalize too; the ledger logs it.

**Rules**
- Extra wound boxes on a cyberdeck or a vehicle belong to that device (CRB
  p.62), no longer to the runner. The sheet shows them with the device.
- “Limited to one realm” reduces an initiative amp once per initiative level it
  holds (CRB p.61). An amp's rating no longer goes below 0 (which paid nuyen
  back at creation) unless the GM approves it on Review.
- A cyberdeck's Firewall is 5 at most (CRB p.62; the book's own decks top out
  there).
- Armor +1 and damage +1 from several amps stack only up to the effect's
  maximum (CRB p.61). The sheet counts the capped bonus and Review notes it.
- Flying doubles a vehicle's base Speed only; Speed upgrades add after that.
- Risk Reduction at creation (owner's reading of CRB p.85, “including from
  stacking”): the total RR on one Test (Attribute + Skill + specialization) is
  checked against the level's limit, and Review says where each point comes
  from.
- House rule (owner's decision, replaces the DHSA price): a SINner quality is
  always free and never counts as the first Quality, whether the box added it
  or you did. Existing runners price it that way when opened (a finalized
  runner's balance doesn't move). Only the SINner itself counts: another amp
  renamed SINner, or a SINner given any effect (a narrative one too), costs
  what it rates and counts for the first-Quality rule.
- A GM-set item price below 0 counts as 0 (Review flags it); the price box
  takes no negative value.
- Page references: levels, budget and starting gear CRB p.85, packages p.86,
  lifestyles p.166, GM approval of drawbacks p.61. The importer already reads
  the right pages; core tables imported before cite the old ones until the core
  rulebook is imported again.

**Character sheet and look** (from the backdrops branch)
- A portrait backdrop per runner (white, grey, dark, or a grid, halftone, neon
  or rain pattern) behind a transparent portrait, and a strength slider for the
  background art.
- The sheet puts weapons (with DVs by ammunition) and spells in sections of
  their own, knowledge and languages at the bottom, a bigger portrait and its
  own background art switches.

## 0.5.4 — 2026-09-30: example characters without unexplained problems

Every example character, imported from the books or one of the first release's
built-ins, was checked against its book. What was our mistake is fixed; what
the book itself prints against a guideline is now said on the runner.

**Rules and prices**
- A drawback the book prints on a sample's amp (an effect limited to some
  situations) no longer needs GM approval: it's the book's price.
- An armor add-on worn over other armor (a ballistic mask, a rigger cocoon)
  costs only its own points and counts on top of the armor under it. It was
  charged as a whole second armor. Armor doesn't stack (CRB p.148) except a
  shield, so Review notes any other add-on.
- Changing a book drawback's value, or duplicating a runner, makes it a
  player's drawback again: it needs GM approval.

**Imported examples** (import the books again to get them)
- Each Equipment amp comes with the item it's bought with (CRB p.60): the one
  of its name, the clothes a well-stocked closet's "Armor 1" is, or the item the
  stat page leaves out (combat drugs, a focus, a kit). Some came without and
  showed "needs its item bought first".
- A branded commlink printed in place of "Commlink" (a high-end one, a secured
  one) is the free starting commlink; an amp on it upgrades it.
- Gear an implant has built in (a cyberarm's RCC) isn't bought a second time.
- Implanted weapons printed without a type (knuckles, a spur, claws) are bought
  as weapons, as the book prices them; an astral copy of a weapon row isn't a
  second weapon; a specialist weapon (a grenade launcher) is priced as one.
- The first weapon a drone's own mount takes (an SMG on a small drone, an
  assault rifle on a medium one) no longer costs an Enhanced weapon mount; a
  second weapon still does.
- A specialization rolled with two attributes is bought once.
- The core rulebook's dispositions and cues come from the page layout: one
  that wraps onto two lines, or holds two sentences, stays one.
- What the book itself prints against a creation guideline (over the budget, a
  basic skill below 2, its own specialization, no cues, Cracking without a
  deck) comes as an approved note, such as "As printed in the Pregen booklet
  p.12: 2,500¥ over the creation budget."

**Gear and the receipt**
- The free starting gear shows its name like any other gear; **Rename** opens
  the name and description.
- Over budget reads **Over budget by N¥**, in red, and adding or removing a
  priced item says what it cost or gave back ("−2,500¥: Extra Fake SIN
  removed").

## 0.5.3 — 2026-09-30: starting gear, a real SIN, native language, knowledge order

**Starting gear**
- Every runner, new or old, draft or finalized, examples included, carries a
  free **Commlink (with trodes)** and **Fake SIN** (CRB p.84). They sit on the
  Gear tab marked **Free (starting gear)**: rename them (the fake SIN’s name)
  and add a description, but they can’t be removed or sold. The printed sheet
  lists them with the rest of the equipment.
- Never twice: a runner that already has them gets none, and a draft (an
  imported pregen whose stat page lists “Fake SIN, Commlink”) keeps exactly one
  of each, now free. Only those exact names count: “Commlink (Hermes Ikon)” or
  “Fake SIN (R4 corp)” stay paid items. A finalized runner’s items are never
  changed: it only gains the free entries at 0¥, so its receipt and balance
  stay as recorded.

**A real SIN**
- **Has a real SIN** on the Concept tab (not a core rule) adds a free **Real
  SIN** entry to name, e.g. national or corporate, and, when an imported book
  has a quality named SINner (Daegann’s Shadow Amps), that quality, free and
  marked non-canon like the rest of that book. A runner that already has a
  SINner quality (added by hand before this release) shows the box ticked,
  gets its Real SIN entry when opened, and never a second quality. Unticking
  removes the entry and the quality, asking first when you added the quality
  yourself. Without the book, a note says only the entry is added. Once a
  runner is finalized the box is locked: set it before finalizing, or ask your
  GM.

**Knowledge & languages**
- Two lists, **Knowledge** and **Languages**, each A–Z. Drag a row by its
  handle, or use its ↑ ↓ buttons from the keyboard, to set your own order;
  **Sort A–Z** puts it back.
- Order and hiding belong to each entry, so two entries of the same name stay
  independent.
- **Hide** leaves an entry off the printed sheet; it stays on the runner,
  dimmed with **Show**, and still counts.
- Mark one language **Native**: it’s free, one per runner, and the first
  language added to a runner is marked for you. The app’s reading of the rules:
  knowledge skills cover foreign languages, so the one you grew up with isn’t
  bought. Older runners have no native mark, so their prices don’t change.

**Files**
- New in the character format: `starting` and `note` on items, `realSin` on the
  amp the box added, `native` and `id` on a knowledge entry, and `knowledgeOrder` /
  `knowledgeHidden` in the build. Older files load unchanged and gain the
  starting gear. The importer marks a pregen’s fake SIN and commlink as
  starting gear.

**Accounts**
- A page signed in as one account never saves or reads under another's
  sign-in: when someone else signs in in another tab of the same browser, the
  first tab's next request is refused and it asks to sign in again, so its
  unsaved change can't land in their runners.
- A backup's, restore's or data pack's download token works only for the admin
  who made it.
- On a Windows host, a runner save no longer fails when someone is listing
  runners at that moment.

## 0.5.2 — 2026-09-29: knowledge skills, languages, saving and the runner list

**Knowledge & languages**
- One **Knowledge & languages** list on the Skills tab, each entry saying
  where it comes from: **Free: keyword** (named after the keyword), **Free:
  <Skill> 4+** (named after the skill; rename it to anything related, it
  stays tied to that skill) or **Paid** (the knowledge price).
- Each entry is marked **Knowledge** or **Language**; the printed sheet lists
  languages and knowledge skills separately. There’s no free native language.
- A skill reaching 4 gets its free entry by itself. Lowering it below 4 asks
  first when its entry was renamed, since that entry then costs the knowledge
  price (Review notes it). A keyword’s entry follows the keyword’s text; remove
  the keyword and an entry you had marked stays as a paid one, noted on Review.
- In career mode, adding an entry is a ledger entry at the knowledge price;
  renaming a free one is recorded at no cost, and a free entry whose skill
  dropped below 4 can be paid for.
- Older files load unchanged: their knowledge skills are paid entries, and a
  “Language: X” entry becomes the language X.

**Saving**
- The runner’s bar shows the save state: “All changes saved” with the time,
  “Saving…”, or “Not saved” in red with the server’s reason and **Retry**.
- **Save** saves right away; **Save and close** goes back to the runner list
  once it’s saved.
- Leaving a runner sends its last change first, and the runner list waits for
  it. If it can’t be saved, leaving (or closing the tab) asks first.

**Runner list**
- Sorted A–Z by street name (else real name), ignoring case, accents and
  punctuation, so Father O’Neil files under F; unnamed runners come last.
  **Sort** also offers Z–A and Recently edited, and the browser remembers it.
  Before, the list followed the order of the files on the server, which could
  put a runner at the very bottom.
- **Search** by street name or real name.
- A **Draft** or **Finalized** badge on each runner and on the runner’s page
  replaces the Creation / Career label. A draft opens where it was left.
- A portrait that doesn’t load shows the runner’s initial instead.
- A saved file the app can’t read is no longer left out of the list: it shows
  as “Couldn’t open …” with the reason (line, column and element), **Download
  file**, and **Try to repair**, which lists what it would change (characters
  XML can’t hold removed, a stray “&” escaped, an unreadable part dropped) and
  saves the repaired runner after you confirm. Opening a runner reads only
  its own file.

**Saving what you type**
- Text pasted from a PDF can carry control characters XML can’t hold; they’re
  now dropped when saving instead of making the file unreadable. Line breaks
  and tabs in names, and blank fields in a draft (no metatype yet, say), now
  read back exactly as saved. A test saves random runners at every step of
  creation and in career, with every feature and awkward text, and reads
  them back.

## 0.5.1 — 2026-09-29: background art

- **Settings → Background art** (admin): upload your own images (PNG, JPEG
  or WebP, 10 MB each, up to 50), switch each one on or off, delete one after
  a confirm. A file that isn't really one of those images (an SVG or a web
  page renamed .png, say) is refused.
- The images that are on show behind every page for everyone signed in, one
  picked at random on each page load (one on: always that one; none: no
  background). The middle of the screen, where the text is, shows the art
  only faintly; it's a little stronger toward the edges. The dark theme tints
  it indigo, phones show it fainter still, and it never prints.
- **Settings → Background → Plain page** turns it off in your own browser.
- The images live in `library/backgrounds/` (`backgrounds.xml`, with its
  schema), are sent only to signed-in browsers, and travel in backups (not in
  data packs). No artwork ships with the app.
- A dialog opened over another one (like this delete confirm over Settings)
  no longer closes both.

## 0.5.0 — 2026-09-29: campaigns and Ask the rules

**Campaigns**
- A **Campaigns** page (runner list → **Campaigns**): the campaigns you run or
  play in, with the GM, players and runners of each; **New campaign** for the
  admin and editors, who become its GM. Archived campaigns show on request.
- A campaign's page: its runners grouped by player, and the table (GMs and
  players). The GM and the admin open each runner read-only and **Print** it;
  a player sees the others' runners as roster rows (name, archetype, level),
  never their sheets.
- GM tools: add players by username, remove them (their runners leave the
  campaign and stay theirs), rename, a note for the table, archive or
  unarchive, and delete once no runners are in it. The admin adds co-GMs.
- The runner list tags each runner with its campaign, has **Add to
  campaign…** and **Remove from campaign**, and can show one campaign's
  runners only. One campaign per runner: a duplicate is in none. A loaded
  example character is your own copy and joins a campaign like any other.
- Editors now read only the runners in the campaigns they run (they used to
  read everyone's); the admin still reads all.

**Ask the rules**
- Ask a rules question in the bar at the top of the builder and of a
  campaign's runners, or with the header's **?** button on any page (a drawer:
  Esc closes it, focus stays inside). Shown once the admin has an AI provider
  chosen, enabled and keyed.
- The answer comes from the passages the server finds in its own books,
  with its sources ("CRB p.61 · QREF Base"), shown as plain text. When the
  books don't cover it, it says so without asking the AI.
- The admin sets **Questions per day** per account on the Users page (blank:
  no limit); the bar shows how many are left, and a used-up day says “You’ve
  used all N of today’s questions. Ask again tomorrow.” (“You’ve used today’s
  question.” for one, “You have no questions today.” for none)
- Nothing is kept: asking again or closing clears the answer, and nothing is
  saved on the server or in the browser.

## 0.4.5 — 2026-09-29: AnythingLLM workspaces

**AI settings**
- AnythingLLM’s workspace can be a name: “Shadowrun Anarchy 2.0” used to fail
  the Test with HTTP 400 “not a valid workspace”, because AnythingLLM wants
  the workspace’s slug. The app now looks the saved text up in the server’s
  workspace list (a slug as is, or a name, ignoring case and spaces at either
  end) for the Test and for reading books, asking for the list once a minute
  at most.
- A workspace the server doesn’t have says so plainly and names the ones it
  has: “Workspace “X” isn’t on this AnythingLLM server. Its workspaces: A, B.”
  AnythingLLM’s own 400 “not a valid workspace” reads the same way.
- **Load workspaces** (AnythingLLM’s list button) shows the workspaces by
  name and saves the one you pick by its slug; asked with the saved key at the
  saved address, never following a redirect.
- **Test** no longer stays disabled after saving and reloading: it compares
  only the fields that provider’s test uses, trimmed as they are saved. The
  API key box no longer invites the browser’s password manager to fill the
  box before it (AnythingLLM’s workspace). Whenever Test is disabled, the text
  beside it says why: unsaved changes, no key saved, or a test running.

## 0.4.4 — 2026-09-29: the trash

**Trash**
- A **Trash** page for every account (**Trash (N)** in the runner list, and
  the account menu) lists the runners you deleted, with when each was
  deleted.
- **Restore** puts a runner back in your library. If a runner with the same
  id is already there (or in anyone’s library), it comes back as a copy with
  a new id, named “… (restored copy)”.
- **Delete forever** removes one; **Empty trash** removes them all, after
  asking: “Permanently delete N runners? This can’t be undone.”
- The admin opens anyone’s trash (a **Trash** button per account on the
  Users page, or the account picker on the Trash page) and can restore or
  empty it. Players and editors only ever see their own.
- The server checks every file name (only `*.xml` in that account’s
  `.trash/`, no separators or leading dot), counts each change as a write,
  and refuses them while a restore runs (`/api/trash`,
  docs/character-format.md).
- Browser-only storage has no trash (deleting there is for good), so the
  page isn’t offered there.
- Only regular files in a trash count (never links, or folders named like
  runners). **Empty trash** deletes the runners the page showed and says how
  many went; a trash file named only by its time restores as `runner.xml`.

**AI settings**
- A **Test** button for each provider (admin only) checks that it’s
  connected: it sends “Reply with the single word OK.” with the saved
  settings and key and shows, for example, “Connected — gemini-2.5-flash
  replied “OK” in 1.2 s.” Otherwise it says why in plain words: the key was
  refused, the model or workspace wasn’t found, the address can’t be
  reached, or there was no answer within 30 seconds. Works for Anthropic,
  OpenAI-compatible servers, Gemini and AnythingLLM. The key is never shown
  or logged; one test runs at a time, at most 10 a minute
  (`POST /api/ai-test?provider=`).

## 0.4.3 — 2026-09-29: the example character library

**Example characters**
- **Load example characters** (renamed from “Load sample characters”; every
  role) now brings every example the server has: the imported books’ runners
  (the core rulebook’s pregens and Lightning, Daegann’s pregen booklet) and
  the server’s example sets in `custom/samples/<set>/`, such as the first
  release’s 28 built-in runners in `custom/samples/builtin/`.
- One copy per character: at most one canon version (a canon book’s over an
  example set’s; of several canon books, the newest import) and one
  non-canon version. Loading again, re-importing a book, or already holding
  an older copy of the same character never adds a second one. Each person
  gets their own copies, so a player who joins later loads the full set.
- Example sets are read only: the admin manages `custom/samples/` on disk,
  the app lists it for everyone signed in (`GET /api/samples`), and backups
  carry it. An optional `set.xml` names a set and says whether it is canon
  (schema `sampleset.xsd`); `builtin` without one is “Built-in samples
  (first release)”, canon.
- **Tidy up** now offers to move every extra copy beyond one per character
  and canon-ness to your trash, and lists each one with where it came from.
  A copy you changed always stays; otherwise the preferred version stays.
  Other accounts’ runners are never touched.

## 0.4.2 — 2026-09-29: the last review leftovers

**Books and core data**
- The review screen edits every part of an AI-read core row: a metatype’s
  attribute ranges (min and max per attribute) and a skill’s
  specializations (add, rename, remove). The edits are checked on the
  screen and again when the rows are added, like any other edit; a range
  whose minimum is above its maximum and a specialization id used twice
  are now flagged too.
- The Books page’s “Read by AI” note goes for a table a data pack later
  replaced (a re-import already cleared it).

**Fixes**
- Table rules: two quick switches on the Rules page both save; the second
  no longer undoes the first.
- Renaming a username: if saving the accounts fails and the runner folder
  can’t move back either, the original error is still reported, and the
  server log says which folder to move by hand.

## 0.4.1 — 2026-09-29: table rules, self-service Authelia link and fixes

**Rules and samples**
- The **Rules** tab is for the GM (admin and editors). **Table rules** are
  switches for the core rulebook’s optional rules (extended social tests,
  vehicle rules for characters, critters and devices, planning pool or
  personal Edge), plus house rules the GM adds. They’re stored in
  `custom/table-rules.xml` and travel with backups. Players get a read-only
  **Table rules** page listing what’s on; the quick-reference data is still
  readable by everyone.
- **Load sample characters** never duplicates: each sample has a stable key,
  saved on the runner, and every account gets its own copies. The Library
  offers a one-time **Tidy up** that moves unchanged duplicates to your
  trash and never touches one you edited.

**Accounts**
- **Link my Authelia account**: a password account can switch itself to
  Authelia from the account menu. It asks for the current password and a
  fresh Authelia sign-in, refuses an Authelia user already linked elsewhere,
  ends the other sessions and drops the password.
- The Users page can rename a username; the person’s runners move with it.
- Sign-out waits for runner saves to finish (Duplicate, Export, import and
  delete included) and asks before leaving one behind.
- Settings links to **AI settings** for the admin.

**Books and core data**
- Loading a data pack now shows a preview (when it was made, the app version,
  what it replaces) and waits for your confirmation.
- A book can override a core price. The Conversion Guide import sets the
  complex-form price it prints; the core still writes the spell price as a
  stand-in.
- If the core rulebook’s recipe can’t read a core table, the AI fallback now
  covers all of them, not just weapons and armor.
- The automatic core rebuild follows the rulebook file itself: uploading or
  re-importing the same PDF replaces a data pack’s tables, and moving the
  file between Library folders no longer triggers a rebuild.
- Error messages read as sentences, and none names a particular host.

## 0.4.0 — 2026-09-28: accounts, Authelia and core data

**Accounts**
- Sign-in is required. On first start, a one-time setup code in the
  container log creates the first admin; the admin creates everyone else
  on the **Users** page (app password or Authelia), and can disable,
  reset or delete an account.
- Three roles — admin, editor, player — each seeing and doing only what
  their row of the roles table allows; the server enforces every rule, not
  just the UI. Each person owns their own runners; admins and editors can
  view and print everyone's, read-only.
- Sign in with an app password, or with [Authelia](https://www.authelia.com/)
  (OpenID Connect, with Authelia's own two-factor) per account.
- Locked out? `docker exec chummer-anarchy2 node server/users.mjs reset
  <user>` prints a one-time recovery code for `/#/setup/reset`.

**Core data out of the repository**
- The core rulebook's catalogs (levels, metatypes, skills, pricing, amp
  types and effects, packages, lifestyles, generic weapons, armor,
  vehicles) no longer ship with the app or live in its git history. A
  server builds them by importing the CRB PDF like any other book, or an
  admin loads a **data pack** — a small zip of just those tables, with no
  descriptions, PDFs or keys — exported from another server. Upgrading a
  server that already has the CRB in its Library re-imports it
  automatically on first start.

**Security hardening**
- Passwords hashed with scrypt; sessions are random tokens, stored as
  hashes, 30-day sliding expiry, `Secure`/`__Host-` behind a trusted
  proxy.
- Sign-in lockout per account and per client address/network, with a
  known-device cookie so a household's other sign-ins aren't slowed by one
  wrong password; every non-GET request is checked against its Origin.
- `TRUST_PROXY` and `PUBLIC_URL` settings (Unraid template: **Trusted
  proxy**, **Public address**) so the app knows which forwarded headers to
  believe when it sits behind a reverse proxy, with an example nginx rate
  limit for the login route.

**Backup changes**
- Backups now include accounts (`users.xml`, sign-in settings, every
  runner folder); sessions never do. The Authelia client secret travels
  only with **Include my API keys**. A restore signs everyone out; a
  backup from before accounts puts the server back into setup, with its
  runners going to the new first admin.

**Breaking**
- The app now requires signing in — it's no longer open to anyone who can
  reach it. Plan for the first-start setup code when upgrading.
- A server with no core data (a fresh install, or an upgrade whose CRB PDF
  isn't in its Library) opens on a setup page until the CRB is imported or
  a data pack is uploaded.

## 0.3.0 — 2026-09-28: edit the catalog, back up the server

**Catalog edits**
- An **Edit** button on any amp, item or rule (pickers, Game data, the Rules
  page) opens the Amp Builder in catalog mode, or a form with a Description
  box. Edits live in their own layer on the server, so a re-import never
  touches them; an edited entry gets an **Edited** mark and a **Restore
  book version** button.
- **Add entry** creates a new amp, item or rule under a house-rule source
  you name or pick.

**Backup and restore**
- Settings → **Backup**: **Download backup** zips up everything the server
  keeps — runners, house rules and edits, imported books, uploaded PDFs and
  AI settings — with "Include my API keys" left unticked by default.
- **Restore from backup** uploads a zip, shows what's in it (date, app
  version, file counts) before anything changes, then replaces the
  server's data. The server saves its own current state first, to
  `library/.backups` (newest 3 kept), so a restore can be undone.
  Restores are capped at 20 GB.

## 0.2.0 — 2026-09-28: bring your own books

The app no longer ships any book content. You upload the PDFs you own and it
builds its catalogs from them.

**Importing books**
- A **Books** page: upload a PDF, watch the import, re-import or remove it.
  Uploads, their converted text and import reports stay in the Library
  folder, which is never served over the web.
- Recipes for the core rulebook (spells, amps, gear, the 12 pregens and the
  Lightning example), the Conversion Guide (complex forms, technomancer
  rules), Daegann's Shadow Amps Expanded List, his pregen booklet (15 sample
  runners) and the quick-reference sheets (116 rules).
- Descriptions are kept privately per book, next to your imports.
- Any other book can go through an AI you set up: Anthropic, OpenAI-compatible
  (including Ollama and LM Studio), Gemini or AnythingLLM. Pick the model from
  a list loaded with your key, or type it. Proposed entries wait on a review
  screen until you accept, edit or drop them.
- API keys are stored in their own file, never shown again, and cleared if a
  provider's address changes.

**Catalog**
- Canon and non-canon: the core rulebook and Conversion Guide are canon;
  Daegann's material and the quick-reference sheets are published but not
  canon. Each runner can be set to flag non-canon content.
- Every entry shows which book and page it comes from. When two books define
  the same thing, both are kept and labelled.
- Six extra specializations from the expanded amp list, a searchable Rules
  page and hover help on amp effects.
- Existing runners keep working: their entries are mapped to the right book.

**Installing**
- Published as a public image, `ghcr.io/jbowensii/chummer-anarchy2`, with an
  Unraid template in [jbowensii/unraid-templates](https://github.com/jbowensii/unraid-templates).
  A new **Library** folder holds your uploaded books.

## 0.1.0 — 2026-09-27: first version

Character creation with a live nuyen receipt and cited rule checks, the
Shadow Amp builder, weapons, vehicles, technomancers, lifestyles, the career
ledger, a printable sheet in the book's style, light and dark themes, and
runners saved as XML files on the server.
