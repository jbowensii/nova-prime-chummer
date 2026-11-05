# Desktop app (Windows)

Runs the same `server/server.mjs` as Docker, in an Electron utility process bound to 127.0.0.1, in a locked-down window.
Data lives under `%APPDATA%\nova-prime-chummer\` (`Config`, `Data`, `Library`, `Logs`, `Backups`). The version in the installer's file name comes from `package.json`.
There is no setup code: the first admin is made on the setup screen.

## Build (PowerShell, repo root)

```powershell
npm install                       # adds electron + electron-builder
powershell -File tools\desktop-python\build-python.ps1   # once, and after importer deps change: build\python = Python 3.13.9 embeddable + importer libs
$env:CSC_LINK = 'C:\path\to\your-cert.pfx'   # optional: signing (omit for an unsigned build)
$env:CSC_KEY_PASSWORD = '...'                # type it yourself; never commit it
npm run desktop:build             # tsc + vite build, then electron-builder (nsis installer + portable)
```

Python bundle notes: needs `importer\requirements.desktop.lock` (made with `tools\desktop-python\compile-lock.ps1`, requires uv; separate from `requirements.lock`). `$PySha256` in `build-python.ps1` pins the python.org zip; update it together with `$PyVersion`. The PowerShell scripts are not linted.

Output is in `release\`: the NSIS installer and the portable exe. The release workflow (`.github/workflows/publish.yml`) builds and uploads only the installer, on a release tag, and the app updates itself from that GitHub Release. Without a certificate the build is unsigned and Windows SmartScreen warns. Quick dev run without packaging: `npm run desktop` (uses `python` on PATH).

## Verify

1. Launch: a maximized window with no menu opens the app; `%APPDATA%\nova-prime-chummer\Logs\server.log` exists.
2. F5 reloads, F12 toggles dev tools; an external link opens in the normal browser.
3. `curl http://127.0.0.1:47480/api/health` returns 403 (no secret); the window itself works.
4. `curl -H "Host: evil.test" http://127.0.0.1:47480/` returns 403; the port is not reachable from another machine.
5. Start an import: it runs (Python from `resources\python`, importer from `app.asar.unpacked`).
6. Quit during a job: the process list shows no leftover node/python; relaunch resumes the job.
