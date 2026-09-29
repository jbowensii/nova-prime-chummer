# Deployment: tower04

First deployed 2026-09-27.

## Install

**(a) Unraid** — Docker tab → **Template repositories** → add
`https://github.com/jbowensii/unraid-templates` → Save. Then **Add
Container** → pick *chummer-anarchy2* → Apply.

**(b) Plain docker / any other dashboard:**

```bash
docker run -d --init -p 8480:80 \
  -v /path/to/characters:/data/characters \
  -v /path/to/custom:/data/custom \
  -v /path/to/library:/data/library \
  ghcr.io/jbowensii/chummer-anarchy2:latest
```

**(c) One-time owner step after the first publish:** the GHCR package is
created private by default. Go to GitHub → the account's **Packages** tab →
**chummer-anarchy2** → **Package settings** → **Change visibility** → Public.
Until that's done, pulls from Unraid or any other host will fail with
"unauthorized".

### Build it yourself

```bash
docker build -t chummer-anarchy2:latest .
docker run -d --init -p 8480:80 -v /path/to/characters:/data/characters -v /path/to/custom:/data/custom -v /path/to/library:/data/library chummer-anarchy2:latest
```

| | |
|---|---|
| URL | http://10.47.40.44:8480/ |
| Container | `chummer-anarchy2`, bridge network, 8480 → 80, Autostart on. Runs `server/server.mjs` (Node), health check `/api/health` |
| Template | Added via the `jbowensii/unraid-templates` template repository (see Install above); Unraid manages it |
| Image | `ghcr.io/jbowensii/chummer-anarchy2:latest`, built and published by GitHub Actions (`.github/workflows/publish.yml`) on every push to `main` |
| Characters | `/mnt/user/appdata/chummer-anarchy2/characters` → `/data/characters`: one XML file per runner ([character-format.md](character-format.md)); deletes go to `characters/.trash/` |
| House rules | `/mnt/user/appdata/chummer-anarchy2/custom` → `/data/custom` (list files in `index.xml`). The importer writes each book's data to `imported/<source>/` and its private descriptions to `texts/<source>.xml`; don't edit those by hand |
| Library | `/mnt/user/appdata/chummer-anarchy2/library` → `/data/library`: one folder per uploaded PDF (`original.pdf`, `book.md`, `import.xml`, `status.xml`, `review.xml`) and `.config/` with the AI settings and keys (`ai-keys.xml`, mode 600). Never served over HTTP; back it up with the rest of appdata |
| Icon | written to `/var/lib/docker/unraid/images/` and the dockerman runtime images folder. The template's GitHub raw URL can't serve from a private repo. |

Characters live on the server, in the characters folder. Rebuilding the
image or recreating the container doesn't touch them. Back up the
appdata folder as usual. Browsers that saved runners before server storage
move them to tower04 on first load (done 2026-09-27: 15 runners moved,
the 2 empty "Unnamed runner" files deleted to `.trash`).

## Backup and restore

Settings → **Backup** downloads a zip of all three mounted volumes
(`characters`, `custom`, `library`) plus a manifest; see
[data-format.md](data-format.md#backup-zip) for its layout. A restore
uploads a zip, previews its manifest, then on confirm replaces each of the
three volumes' contents **entry-by-entry**: the zip is unpacked into a temp
folder *inside* each volume (`.restore-new-*`), then the top-level entries
are swapped by renames (the old ones through `.restore-old-*`). A swap that
fails puts that volume back, but volumes already swapped stay swapped, and
a restore killed mid-swap (container stop) can leave a volume partly
swapped; the next start removes leftover `.restore-*` folders. Before any
of that the server saves the tower's current state to
`library/.backups/<timestamp>.zip` (newest 3 kept): if a restore fails or
is cut off partway, restore that safety backup (copy it off the volume and
use Settings → Backup → Restore) to get back to where you were. Without
"Include my API keys" a backup has no `ai-keys.xml`, and a restore keeps
tower04's own keys, except for a provider whose address the backup's AI
settings change (that key is dropped, so it's never sent somewhere new).

## "Force update" on the Docker page

Now that the image is published to GHCR and tagged `latest`, **force update**
on the Docker page works normally: it pulls the newest `latest` build pushed
by the `publish.yml` workflow. (Historical note: before this image was
published, the tag existed only as a tower-local build and force update
failed — Unraid's `CreateDocker.php` skipped the container without stopping
it, so it kept running on the old image. That no longer applies.)

## 0.4.0 upgrade (accounts, core data)

1. Docker page → chummer-anarchy2 → **docker pull** first (0.4.0 needs a
   fresh image pull, not just a container restart), then Edit → **Apply**.
2. If tower04 is exposed through a reverse proxy, fill in **Trusted proxy**
   (its address) and, if there's one public address, **Public address**
   before Apply — see [README.md](../README.md#behind-a-reverse-proxy-trust_proxy).
   Leave both empty for LAN-only.
3. On first start after the upgrade, read the one-time setup code from the
   container log (`docker logs chummer-anarchy2`) and use it to create the
   first admin. Any runners already at the top of the characters folder
   move into that admin's own folder.
4. The core rulebook's tables (levels, metatypes, skills, pricing, amp
   types and effects, packages, lifestyles, generic weapons, armor,
   vehicles) re-import automatically on this first start, since the CRB
   PDF is already in the Library — nothing to upload again. The
   Conversion Guide and DHSA overlays (Tasking, Emerged, implant grades)
   re-run right after.
5. Check **Game data** loaded cleanly and Books still lists the imports,
   then sign in as the new admin and add the other accounts on the
   **Users** page.

## Redeploy after changes

Push (or merge) to `main`; the `publish.yml` workflow builds and pushes
`ghcr.io/jbowensii/chummer-anarchy2:latest`. On tower04: Docker →
chummer-anarchy2 → **force update** (or Edit → Apply). No local build, no
file copy to the tower.

## Books after a deploy

The image ships the rules engine only. To get the amps, spells, gear, rules
text and sample runners back, open **Books** from the library and upload
the PDFs from `Downloads\Shadowrun Anachy 2.0` (the folder's real name, typo included; the core rulebook, the
Conversion Guide, Daegann's amp list and pregen booklet, the four
quick-reference sheets). Each one shows its progress and, when done, its
entry counts and report. Runners already on the server keep working in the
meantime from the catalog entries they store.

A PDF no recipe knows shows **Needs AI**. Set up a provider under **AI
settings** first (after saving a key, **Load models** fills the Model field
with the provider’s list; the container needs outbound HTTPS to the
provider for that, as for extraction); **Extract with AI** then says which provider gets the text
and in how many parts before anything is sent, and the proposals wait on
the review screen.

## Verification on the deployed container (2026-09-27)

- The Game data page: 14 files, "Every file loaded cleanly" (with the empty
  custom mount). Historical: that image still shipped the catalogs; the
  count now depends on which books have been imported.
- Plain-http context (`isSecureContext` false, no `crypto.randomUUID`):
  creating a runner works through the `newId()` fallback.
- The rulebook's sample runners loaded and priced as the book prints them
  (the per-runner checks are now each import's report).
- A sample's book drugs showed errors (initiative on an Equipment amp); the
  book makes that exception for its own drugs, so catalog effects are now
  sanctioned.

## Redeploy 2026-09-27 (fix-everything pass)

Rebuilt and recreated via Edit → Apply; previous image removed. The data
files loaded cleanly, weapon DVs and vehicle stats showed on the sample
runners, and the container reported healthy. The browser library was
untouched by the rebuild. (That image still shipped the book catalogs; they
now come from the Books page.)
