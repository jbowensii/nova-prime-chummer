# Regenerates importer/requirements.desktop.lock (hash-pinned, CPython 3.13 Windows) for the bundled interpreter.
# Needs uv (https://docs.astral.sh/uv/). Separate from importer/requirements.lock (3.12, universal; used by Docker/CI).
# Hashes come only from this command; never edit the lock by hand.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..\..')
uv pip compile importer/requirements.txt --python-version 3.13 --python-platform windows --generate-hashes -o importer/requirements.desktop.lock
if ($LASTEXITCODE) { throw 'uv pip compile failed' }
