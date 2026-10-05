# Release notes

## Unreleased (next build)

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
- **Importing a runner right after opening the list** no longer fails with "changed elsewhere" when its id is taken:
  the copy gets a new id (both games).
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
