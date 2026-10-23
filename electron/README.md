# Desktop app (Windows)

Runs the same `server/server.mjs` as Docker, in an Electron utility process bound to 127.0.0.1, in a locked-down window.
Data lives under `%APPDATA%\Nova Prime Chummer\` (`Config`, `Data`, `Library`, `Logs`).

## Build (PowerShell, repo root)

```powershell
npm install                       # adds electron + electron-builder
# Chunk 3 must have produced build\python (embeddable Python + importer wheels); until then the app runs but imports fail
$env:CSC_LINK = 'C:\path\to\your-cert.pfx'   # optional: signing (omit for an unsigned build)
$env:CSC_KEY_PASSWORD = '...'                # type it yourself; never commit it
npm run desktop:build             # tsc + vite build, then electron-builder (nsis installer + portable)
```

Output is in `release\`. Quick dev run without packaging: `npm run desktop` (uses `python` on PATH).

## Verify

1. Launch: a maximized window with no menu opens the app; `%APPDATA%\Nova Prime Chummer\Logs\server.log` exists.
2. F5 reloads, F12 toggles dev tools; an external link opens in the normal browser.
3. `curl http://127.0.0.1:47480/api/health` returns 403 (no secret); the window itself works.
4. `curl -H "Host: evil.test" http://127.0.0.1:47480/` returns 403; the port is not reachable from another machine.
5. Start an import: it runs (Python from `resources\python`, importer from `app.asar.unpacked`).
6. Quit during a job: the process list shows no leftover node/python; relaunch resumes the job.
