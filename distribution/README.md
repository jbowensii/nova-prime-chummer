# Install methods

| Method | Files | Checked by |
| --- | --- | --- |
| Docker | `Dockerfile`, `docker-entrypoint.sh` | `distribution/smoke.sh` |
| Docker Compose | `docker/docker-compose.yml` | `tests/server/install-artifacts.test.ts` |
| Unraid | `unraid/nova-prime-chummer.xml` (mirrored in `/unraid`) | `install-artifacts.test.ts` |
| Pelican or Pterodactyl | `pelican/egg-nova-prime-chummer.json` | `smoke.sh` (runs the image as the panel does), `install-artifacts.test.ts` |
| Ubuntu | `ubuntu/install.sh` | shellcheck, `install-artifacts.test.ts` |
| Windows installer and portable | `electron-builder.yml`, `tools/desktop-python` | `build-python.ps1`'s smoke test, `install-artifacts.test.ts` |
