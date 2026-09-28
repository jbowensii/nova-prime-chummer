# Deployment: tower04

First deployed 2026-09-27.

| | |
|---|---|
| URL | http://10.47.40.44:8480/ |
| Container | `chummer-anarchy2`, bridge network, 8480 → 80, Autostart on. Runs `server/server.mjs` (Node), health check `/api/health` |
| Template | `/boot/config/plugins/dockerMan/templates-user/my-chummer-anarchy2.xml`; created through **Add Container**, so Unraid manages it |
| Image | `chummer-anarchy2:latest`, built on the tower from `/mnt/user/appdata/chummer-anarchy2/src` |
| Characters | `/mnt/user/appdata/chummer-anarchy2/characters` → `/data/characters`: one XML file per runner ([character-format.md](character-format.md)); deletes go to `characters/.trash/` |
| House rules | `/mnt/user/appdata/chummer-anarchy2/custom` → `/data/custom` (list files in `index.xml`). The importer writes each book's data to `imported/<source>/` and its private descriptions to `texts/<source>.xml`; don't edit those by hand |
| Library | `/mnt/user/appdata/chummer-anarchy2/library` → `/data/library`: one folder per uploaded PDF (`original.pdf`, `book.md`, `import.xml`, `status.xml`, `review.xml`) and `.config/` with the AI settings and keys (`ai-keys.xml`, mode 600). Never served over HTTP; back it up with the rest of appdata |
| Icon | written to `/var/lib/docker/unraid/images/` and the dockerman runtime images folder. The template's GitHub raw URL can't serve from a private repo. |

Characters live on the server, in the characters folder. Rebuilding the
image or recreating the container doesn't touch them. Back up the
appdata folder as usual. Browsers that saved runners before server storage
move them to tower04 on first load (done 2026-09-27: 15 runners moved,
the 2 empty "Unnamed runner" files deleted to `.trash`).

## "Force update" on the Docker page is safe

The image is built on the tower and exists in no registry, so Unraid shows
the update status as "not available". Pressing **force update** tries to
pull `chummer-anarchy2:latest` from Docker Hub, which fails. Unraid's
`CreateDocker.php` (line 261) then skips the container (`continue`)
without stopping or removing it, so it keeps running. Verified by reading
dockerMan's code on tower04 on 2026-09-27.

## Redeploy after changes

From the PC, in the repo:

```bash
git archive --format=tar -o "$TEMP/chummer-anarchy2.tar" main
cp "$TEMP/chummer-anarchy2.tar" //tower04/temp/chummer-anarchy2.tar
cp unraid/chummer-anarchy2.xml //tower04/temp/my-chummer-anarchy2.xml
```

On tower04 (the web terminal at http://tower04/webterminal/ttyd/):
`bash /mnt/user/temp/ca2-rebuild.sh`. It unpacks the source, installs the
template, creates the characters folder if missing, rebuilds the image and
reinstalls the icon, and logs to `/mnt/user/temp/ca2-rebuild.log`.
Descriptions are no longer copied by hand (`ca2-texts`): the importer writes
them when the books are uploaded, so the script's texts step has nothing to
do and can be dropped. Create the Library folder once
(`mkdir -p /mnt/user/appdata/chummer-anarchy2/library`) and add the
**Library** path from the updated template.
Then go to Docker → chummer-anarchy2 → Edit, make any edit and undo it (so
Apply enables), then Apply. That recreates the container on the new image.

## Books after a deploy

The image ships the rules engine only. To get the amps, spells, gear, rules
text and sample runners back, open **Books** from the library and upload
the PDFs from `Downloads\Shadowrun Anachy 2.0` (the folder's real name, typo included; the core rulebook, the
Conversion Guide, Daegann's amp list and pregen booklet, the four
quick-reference sheets). Each one shows its progress and, when done, its
entry counts and report. Runners already on the server keep working in the
meantime from the catalog entries they store.

A PDF no recipe knows shows **Needs AI**. Set up a provider under **AI
settings** first; **Extract with AI** then says which provider gets the text
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
