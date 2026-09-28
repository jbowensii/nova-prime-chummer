# Deployment: tower04

First deployed 2026-09-27.

| | |
|---|---|
| URL | http://10.47.40.44:8480/ |
| Container | `chummer-anarchy2`, bridge network, 8480 → 80, Autostart on. Runs `server/server.mjs` (Node), health check `/api/health` |
| Template | `/boot/config/plugins/dockerMan/templates-user/my-chummer-anarchy2.xml`; created through **Add Container**, so Unraid manages it |
| Image | `chummer-anarchy2:latest`, built on the tower from `/mnt/user/appdata/chummer-anarchy2/src` |
| Characters | `/mnt/user/appdata/chummer-anarchy2/characters` → `/data/characters`: one XML file per runner ([character-format.md](character-format.md)); deletes go to `characters/.trash/` |
| House rules | `/mnt/user/appdata/chummer-anarchy2/custom` → `/data/custom` (list files in `index.xml`). Also holds the private descriptions, one file per source in `texts/` (`dhsa.xml`, `qref.xml`), which are never committed |
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
git archive --format=tar -o "$TEMP/chummer-anarchy2.tar" feat/v1
cp "$TEMP/chummer-anarchy2.tar" //tower04/temp/chummer-anarchy2.tar
mkdir -p //tower04/temp/ca2-texts && cp .extract/private/texts/*.xml //tower04/temp/ca2-texts/   # when the text changed
cp unraid/chummer-anarchy2.xml //tower04/temp/my-chummer-anarchy2.xml
```

On tower04 (the web terminal at http://tower04/webterminal/ttyd/):
`bash /mnt/user/temp/ca2-rebuild.sh`. It unpacks the source, installs the
private `texts/` files and the template, creates the characters folder if
missing, rebuilds the image and reinstalls the icon, and logs to
`/mnt/user/temp/ca2-rebuild.log`.
Then go to Docker → chummer-anarchy2 → Edit, make any edit and undo it (so
Apply enables), then Apply. That recreates the container on the new image.

## Verification on the deployed container (2026-09-27)

- The Game data page: 14 files, "Every file loaded cleanly" (with the empty
  custom mount).
- Plain-http context (`isSecureContext` false, no `crypto.randomUUID`):
  creating a runner works through the `newId()` fallback.
- All 13 rulebook characters loaded. Totals: 9 at exactly 375,000¥;
  Hercules and Echo at 380,000¥ (the free closet Armor point); Capitán at
  372,500¥. Every wound threshold matches the book.
- Drakk initially showed 2 errors (Jazz grants initiative as an Equipment
  amp). The book makes that exception for its own drugs, so catalog
  effects are now sanctioned; redeployed, only a note remains.

## Redeploy 2026-09-27 (fix-everything pass)

Rebuilt and recreated via Edit → Apply; previous image removed. On the
deployed container: 16 data files load cleanly (554 amps including 84
mods, 77 spells, 31 complex forms, 4 lifestyles); Drakk's Gear shows
Unarmed DV 5, Swords 7, Throwing knife 6; Charon's Amps shows the
Northstar (Pilot 6, Body 7, Handling 1, Speed 4, Armor 1) and the
Quadrotor (Speed 4, flying); his sheet has the Vehicles section. The
container is reported healthy. The browser library was untouched by the
rebuild.
