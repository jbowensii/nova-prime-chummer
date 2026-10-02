# Release notes

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
