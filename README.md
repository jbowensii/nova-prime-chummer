# Chummer Anarchy 2.0

Version 0.4.1 — see [CHANGELOG.md](CHANGELOG.md) for release notes.

A character generator and career tracker for **Shadowrun: Anarchy 2.0**: the
Commlink6 / Chummer experience, built for Anarchy 2.0’s nuyen-only rules.
(Not Anarchy 1st edition, which uses different rules.)

**Bring your own books.** The app ships the rules engine only. Amps, spells,
complex forms, gear, rules text and sample runners come from the PDFs you
upload on the **Books** page: the core rulebook, the Conversion Guide,
Daegann’s expanded amp list and pregen booklet and the quick-reference sheets
are read by recipes; any other book can be read by an AI you set up (your
own API key), and you review its entries before they’re added.

- **Guided creation.** Pick Ganger, Runner or Prime Runner and optionally a
  book package. A live nuyen receipt, with every rule checked and cited to its
  page. A GM can approve any exception.
- **Shadow Amp builder.** An amp type plus effects from the effect table gives
  its rating, cost and Essence automatically. Imported books add their prebuilt
  amps and add-ons (ammo, accessories, vehicle and deck mods, implant grades).
  Two books defining the same amp are both kept and told apart.
- **Weapons, vehicles, mental armor.** Weapon damage is worked out from
  Strength and bonuses. Vehicles and drones show Pilot, Body, Handling, Speed,
  Armor and damage thresholds. Astral Armor, Mystic Armor and biofeedback
  filters raise the mental thresholds.
- **Technomancers** (from the CGL Conversion Guide): the Emerged amp, the
  Tasking skill, a living persona (Firewall = Willpower, Attack = Charisma),
  and the complex forms your books bring.
- **Lifestyles** (CRB p.165) adjust what each run pays.
- **Career ledger.** After Finalize, record earnings and spend them at the
  creation prices. History is append-only, and an entry is undone by voiding it.
  Creation can be reopened until the first ledger entry.
- **Printable sheet** laid out like the official one. Your browser’s “Save as
  PDF” makes the PDF.
- **Sample characters** from your imported books load with one click: the
  rulebook’s pregens and Lightning, and Daegann’s pregen booklet. Loading them
  again never adds copies, and each person gets their own. If earlier versions
  left duplicates, the Library offers **Tidy up**: it moves unchanged
  duplicates to your trash and never touches one you edited. Each import’s
  report lists any printed number the engine doesn’t reproduce; see
  [docs/book-discrepancies.md](docs/book-discrepancies.md) for the rules calls.
- **Canon and non-canon.** The core rulebook and Conversion Guide are canon.
  Published material that isn't official rules (Daegann's expanded amp list
  and pregens, the quick-reference sheets) carries a **Non-canon** badge, and
  a runner can be set to canon only, which flags any on the Review tab.
- **Rules reference** from the Base, Magic, Matrix and Vehicles quick
  reference sheets: a searchable page plus hover help on matching effects.
  The **Rules** tab is for the GM (admin and editors). Its **Table rules**
  switches turn the book’s optional rules on or off, and the GM can add house
  rules. Players get a read-only **Table rules** page listing what’s on.

## Run it

Served by its own small Node server (Docker / Unraid), the app saves every
runner as an XML file in the `characters` folder, shared by every browser on
your LAN. Runners already saved in a browser move there on first load. With
no server (`npm run dev`, a plain static host), runners stay in the browser.
**Export** writes the same XML file. See
[docs/character-format.md](docs/character-format.md).

### Locally

```bash
npm install
npm run dev        # http://localhost:5173 (runners saved in the browser)
npm run serve      # build + server on :80 (set PORT, CHAR_DIR, CUSTOM_DIR, LIBRARY_DIR, PYTHON)
```

### Unraid

1. **Docker** tab → **Template repositories** → add
   `https://github.com/jbowensii/unraid-templates` → **Save**.
2. **Add Container** → pick *chummer-anarchy2* from the template list → Apply.
   The web UI is on port 8480.

This pulls the published image `ghcr.io/jbowensii/chummer-anarchy2:latest` —
no build step on the server.

### Docker / any dashboard (Portainer, Dockge, Yacht, …)

```bash
docker run -d --init -p 8480:80 \
  -v /path/to/characters:/data/characters \
  -v /path/to/custom:/data/custom \
  -v /path/to/library:/data/library \
  ghcr.io/jbowensii/chummer-anarchy2:latest
```

### Build it yourself

```bash
docker build -t chummer-anarchy2:latest .
docker run -d --init -p 8480:80 -v /path/to/characters:/data/characters -v /path/to/custom:/data/custom -v /path/to/library:/data/library chummer-anarchy2:latest
```

### Accounts

Sign-in is required: everyone needs an account on the server. There's no
self sign-up — the admin creates each one on the **Users** page.

**First start.** With no accounts yet, the app shows a setup page. Read the
one-time setup code from the container log (`docker logs chummer-anarchy2`)
and enter it with a name, username and password to create the first admin.
The code is new on every restart and works once. Upgrading a server from
0.3 (no accounts yet) does the same thing: on setup, any runners already
saved at the top of the characters folder move into the new admin's own
folder.

**Roles.**

| | admin | editor | player |
|---|---|---|---|
| Own runners: create, edit, delete | ✓ | ✓ | ✓ |
| Everyone's runners: view, print | ✓ | ✓ | – |
| Catalog edits, Add entry, house-rule sources | ✓ | ✓ | – |
| Catalog, descriptions, Data (read); Table rules (read) | ✓ | ✓ | ✓ |
| Rules tab, Table rules switches and house rules | ✓ | ✓ | – |
| Books page, imports, AI settings and keys | ✓ | – | – |
| Backup and restore | ✓ | – | – |
| Users page, Sign-in settings | ✓ | – | – |

The server enforces every rule; a hidden control is only convenience. There
is always at least one enabled admin.

**Users page** (admin, account menu → Users): add an account (name,
username, email, role, app password or Authelia); edit name, username, email,
role or sign-in method (renaming moves the person’s runners with them and
they sign in with the new name); disable/enable; reset a password (also ends that person's
other sessions); move a runner to another user; delete (only with no
runners, or after moving them).

**Sign-in settings** (account menu → Sign-in, admin) turns on Authelia —
see [below](#sign-in-with-authelia-openid-connect). **AI settings** has a link
in Settings too.

**Locked out?** From the host:

```bash
docker exec chummer-anarchy2 node server/users.mjs reset <username>
```

prints a one-time code (15 minutes) to use at `<app address>/#/setup/reset`
to set that account a new password. It also works when Authelia is down —
it switches the account back to an app password.

### Behind a reverse proxy (TRUST_PROXY)

Set `TRUST_PROXY` (template: **Trusted proxy**) to the address of the proxy that talks to the container, e.g.
`192.168.1.10`. Only requests from these addresses may set `X-Forwarded-For`, `-Proto` and `-Host`, which decide the
client's address (sign-in limits, logs), whether the request came over https (the secure cookie) and the public address.

- List **every hop** that adds `X-Forwarded-For`: with Cloudflare in front of NGINX Proxy Manager, list NPM's address
  *and* Cloudflare's published ranges (<https://www.cloudflare.com/ips/>), or have NPM restore the real address
  (`real_ip_header CF-Connecting-IP`). Otherwise every visitor looks like a few Cloudflare addresses, and one person's
  failed sign-ins slow down everyone's.
- Don't list a whole subnet or the Docker gateway (`172.17.0.1`) while the app's port is published: anything that can
  reach the port from there could claim any client address.
- Empty (the default): no forwarded header is believed.

The app limits sign-in tries itself (per address and network, per account, and a few password checks at a time), but
a flood from many addresses can still keep the sign-in queue full. Rate-limit `/api/auth/login` at the proxy too. In
NGINX Proxy Manager: **Advanced** tab of the proxy host (or plain nginx: the `server` block), with the zone in the
`http` context (NPM: `/data/nginx/custom/http_top.conf`):

```nginx
# http context
limit_req_zone $binary_remote_addr zone=ca2_login:10m rate=10r/m;

# server block
location = /api/auth/login {
    limit_req zone=ca2_login burst=5 nodelay;
    limit_req_status 429;
    proxy_pass $forward_scheme://$server:$port;   # NPM's variables; plain nginx: your upstream
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Behind Cloudflare, key the zone on the real client address (`$http_cf_connecting_ip`, or `real_ip_header
CF-Connecting-IP` with Cloudflare's ranges in `set_real_ip_from`), or use a Cloudflare rate-limiting rule instead.

### Sign in with Authelia (OpenID Connect)

Accounts can sign in through [Authelia](https://www.authelia.com/) instead of an app password, with Authelia's
two-factor. Each person still needs an account on the **Users** page with *Signs in with: Authelia*. Nobody is created
automatically: anyone else is told to ask the admin for an account. An Authelia account can't use an app password, and a
password account can't use Authelia.

- The first Authelia sign-in matches the Authelia username (`preferred_username`) to the account's username; only when
  Authelia sends no username, a verified email (`email_verified: true`) to the account's email. Only plain ASCII names
  match. Keep directory usernames and emails unique.
- That sign-in **links** the account to the Authelia user's `sub` (a stable, opaque id). From then on only that Authelia
  user gets in, even if the names change on either side. **Unlink Authelia** on the Users page undoes it (e.g. when the
  person's directory account was deleted and made again); so does changing the account's username, email or sign-in
  method, and a new issuer address unlinks every account.

1. Register the app as a client in Authelia's `configuration.yml` (Authelia 4.39 and later). The redirect
   URI is your public address + `/api/auth/oidc/callback`; **Settings → Sign-in** shows it.

   ```yaml
   identity_providers:
     oidc:
       clients:
         - client_id: 'chummer-anarchy2'
           client_name: 'Chummer Anarchy 2.0'
           # a digest, not the secret itself. This prints both; the app gets the plain "Random Password", Authelia keeps the "Digest":
           #   authelia crypto hash generate pbkdf2 --variant sha512 --random --random.length 72 --random.charset rfc3986
           client_secret: '$pbkdf2-sha512$310000$…'
           public: false
           authorization_policy: 'two_factor'
           require_pkce: true
           pkce_challenge_method: 'S256'
           redirect_uris:
             - 'https://chummer.example.com/api/auth/oidc/callback'
           scopes: ['openid', 'profile', 'email']
           response_types: ['code']
           grant_types: ['authorization_code']
           token_endpoint_auth_method: 'client_secret_basic'  # or client_secret_post (pick the same in the app)
           id_token_signed_response_alg: 'RS256'              # or ES256 with an ES256 key in identity_providers.oidc.jwks
           userinfo_signed_response_alg: 'none'               # the app reads the userinfo endpoint as plain JSON
   ```

   Authelia (4.39+) keeps `preferred_username` and `email` out of the ID token by default; the app fetches them from the
   userinfo endpoint, so no `claims_policy` is needed.
2. In the app: **Settings → Sign-in** (admin): the issuer address exactly as Authelia names itself (e.g.
   `https://auth.example.com`, no trailing slash), the client ID, the plain client secret, **Test**, then tick *Show
   “Sign in with Authelia”* and **Save**. The secret is stored in `library/.config/auth-secret.xml` (readable by the
   server only), is never shown again, and is dropped when the issuer address changes. A backup carries it only with
   *Include my API keys*.
3. The app must know its public https address: set `PUBLIC_URL` (template: **Public address**, e.g.
   `https://chummer.example.com`, no path), or pass the proxy's `X-Forwarded-Proto`/`-Host` from a `TRUST_PROXY` peer.
   The redirect URI is built from it. With `PUBLIC_URL` set, the app works only at that address (the sign-in and write
   checks compare against it rather than the Host header).

The app checks the ID token itself (RS256 or ES256 signature against Authelia's published keys, issuer, audience,
expiry, nonce) and uses PKCE and a one-time state sealed in a 10-minute browser cookie; it logs who signed in, never a
token. The issuer must be https, and its authorization, token, key-set and userinfo endpoints must be on the issuer's own
host (Authelia's are). Plain http to `localhost`/`127.0.0.1` is only allowed for development, with `ALLOW_INSECURE_OIDC=1`.
Signing out of the app doesn't sign you out of Authelia.

**Link my Authelia account.** With Authelia on, someone who signs in with a password can choose **Link my Authelia
account** in the account menu. It asks for their current password, then sends them to Authelia to sign in fresh. On
success the account switches to Authelia only: the password stops working, their other sessions end and they stay signed
in. It's refused if that Authelia user is already linked to another account or names a different one. Only the admin can
switch the account back (Users page).

### Any static host

`npm run build` and serve `dist/`. The build ships no core data, so a static copy needs the core files too: unzip
a data pack (Books → Download data pack on a server) and put its `core/*.xml` in `dist/custom/imported/core/`.
Without a server there are no accounts, no Books page and no importer; runners stay in the browser.

## Books

Open **Books** from the library and drop your PDFs there. Each upload is kept,
with the importer’s Markdown, in the `library` folder (never served over
HTTP). A known book is imported at once into `custom/imported/<source>/`,
with a report of anything that didn’t match what the book prints. Re-import
reruns it; Remove takes its entries out again (and optionally deletes the PDF).

A book no recipe knows can go to an AI: set up Anthropic, an OpenAI-compatible
server (OpenAI, OpenRouter, LiteLLM, Ollama, LM Studio), Google Gemini or
AnythingLLM under **AI settings**. The key is stored on the server in a file
of its own and never shown again. Once a key is saved, **Load models** asks
the provider (with that key, at the saved address) for its model list to pick
from; AnythingLLM has none, and you can always type a model name instead.
If the core rulebook’s recipe can’t read a core table, the same AI can read it
(any of the core tables, not just weapons and armor); those rows are marked
for you to check against the book. Before anything is sent the page names the
provider and how many parts the book goes in; the proposals then wait on a review screen where you accept,
edit or drop each one (a core table's rows include a metatype's attribute
ranges and a skill's specializations).

Imports need the server (Docker or `npm run serve`) and Python 3 with
`importer/requirements.txt`.

## Core data

The mechanics (levels, metatypes, skills, pricing, amp types and effects,
packages, lifestyles, generic weapons, armor and vehicles) aren't shipped
with the app — they come from the core rulebook. A fresh server shows a
setup page until either:

- **Books → import the core rulebook** (the CRB PDF), the same way as any
  other book, or
- **Books → Core data → Upload data pack**: a small zip of just the core
  tables (no descriptions, PDFs or keys) exported from another server with
  **Download data pack**. Choosing a file shows a preview (when it was made,
  the app version, which tables it replaces) and nothing changes until you
  confirm **Load data pack**.

A book can override a core price: the Conversion Guide import sets the
complex-form price it prints; without it, complex forms cost the
spell price.

Upgrading an existing server that already has the core rulebook in its
Library re-imports it automatically on first start — nothing to do by
hand. XSD schemas for these files ship in `public/data/schema/`, so other
tools can read and extend them. Imported books are overlays in
`custom/imported/`. The format is documented in
[docs/data-format.md](docs/data-format.md).

House rules and extra content go in `custom/` (the mounted appdata folder on
Unraid), listed in `custom/index.xml`:
- the same `id` replaces an entry (imported ids look like `crb.jazz`);
- `<remove id="…"/>` deletes one;
- a new `id` adds one.

Descriptions (amp, spell and gear text, rules text) are private: the importer
writes one file per source in `custom/texts/`, never in this repository.

The app’s **Game data** page shows each source and whether it's canon, what
loaded, and any errors.

## Editing and adding catalog entries

Any amp, item or rule listed in a picker, on Game data or on the Rules page
has an **Edit** button. Amps open the Amp Builder in catalog mode; items and
rules open a form with a Description box. A saved edit shows an **Edited**
mark next to its source, and **Restore book version** drops it, bringing
back what the book printed; a re-import never touches your edits. **Add
entry** creates a new amp, item or rule under a house-rule source you name
or pick.

## Backup and restore

**Settings → Backup** downloads everything the server keeps — runners,
house rules and edits, imported books, uploaded PDFs and AI settings — as
one zip. Tick **Include my API keys** to have them in the file too;
otherwise the zip has none, and anyone restoring it keeps the keys already
on their own server (except for a provider whose address the backup
changes: that key is dropped, so it's never sent somewhere new). Restoring uploads a zip, shows what's in it (when it
was made, the app version, file counts) so you can check before committing,
then **Replace everything on the server** applies it. The server saves its
own current state first, to `library/.backups` (newest 3 kept), so a bad
restore can be undone. Restores are capped at 20 GB.

The accounts travel with the backup (`users.xml`, the sign-in settings and
every runner folder); sessions never do. A restore signs everyone out, and
people sign in with the accounts in the backup. The Authelia client secret
is in the file only with **Include my API keys**; without it the server keeps
its own, unless the backup's sign-in settings name another issuer. Authelia
links to another issuer are cleared. A backup from before accounts puts the
server back in setup: the first admin gets its runners, as in the upgrade.

**Books → Core data** moves just the core rules tables between servers:
**Download data pack** saves them as a small zip (no descriptions, PDFs or
keys), and **Upload data pack** loads one — the way to set up a server
without the core rulebook's PDF. The setup screen links to it.

## Develop

```bash
npm test                 # engine tests on a made-up catalog (Vitest); book tests need your own imports
npm run validate:data    # XSD + reference checks
npm run test:py          # importer tests: Python 3.12 with importer/requirements.txt ($PYTHON, py -3.12, python3 or python)
npm run build && npm run e2e   # Playwright, with a stub importer: smoke, books, AI review, themes…
```

`importer/` turns book PDFs into catalogs (`python -m importer`; recipe `dhsa` reads Daegann’s amp list, `pregens` his pregen booklet into sample runners, `crb` the core rulebook’s spells, Shadow Amps, gear and its 13 sample runners, `cg` the Conversion Guide, `qref` the quick-reference sheets).

Book tests (`tests/books/`) run only when your private catalogs are present
(`BOOKS_DIR`, default `.extract/private/oracle`; imports in
`.extract/private/custom`); in CI they are skipped with the reason.

Design: [spec](docs/superpowers/specs/2026-09-27-chummer-anarchy2-design.md),
[plan](docs/superpowers/plans/2026-09-27-chummer-anarchy2-v1.md),
[PDF importer](docs/superpowers/specs/2026-09-27-pdf-importer-design.md).

---

Shadowrun is a registered trademark of The Topps Company, Inc.; Catalyst Game
Labs publishes it under license. This is a private, unofficial fan tool. No
book content ships with it; the git history still holds catalogs from before
the importer and must be purged before the repository is ever made public.
