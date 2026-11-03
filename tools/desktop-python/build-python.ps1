# Builds build\python: the embeddable CPython + importer libs that electron-builder ships (resources\python\python.exe).
# Run from anywhere on Windows:  powershell -File tools\desktop-python\build-python.ps1   (idempotent; -Force rebuilds)
# Not lintable here (no PowerShell linter in the repo); the CI job .github/workflows/desktop-python.yml runs it.
param([switch]$Force, [switch]$AllowUnverified)
$ErrorActionPreference = 'Stop'

$PyVersion = '3.13.9'   # the one pin: also in .github/workflows/desktop-python.yml and electron/README.md
# SHA256 of python-3.13.9-embed-amd64.zip, checked 2026-11-03 against python.org's sigstore bundle for that file.
$PySha256 = '91d828c2da3a029b41699e918674a0cb379c02cf20dab9c501306885f837402a'
$PipWheelUrl = 'https://files.pythonhosted.org/packages/07/25/ee8c38ae72d66b844ce8eb9711ba905dba21ca1a8a0c960057c41cd23337/pip-26.3-py3-none-any.whl'
# get-pip.py is EXECUTED before the hash-locked install, so it is pinned the same way as the zip.
$PipWheelSha256 = 'f3b60b20ffaadd4415ed7957212a38ac63fa4c5fa375bd0f4a797777940fad13'   # PyPI pip 26.3 wheel

$repo = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$out = Join-Path $repo 'build\python'
$lock = Join-Path $repo 'importer\requirements.desktop.lock'
$stamp = Join-Path $repo 'build\.python-built'   # outside build\python so it is never shipped in the bundle
if (-not (Test-Path $lock)) { throw "Missing $lock. Generate it first: tools\desktop-python\compile-lock.ps1" }
$want = "$PyVersion|$((Get-FileHash $lock -Algorithm SHA256 -ErrorAction Stop).Hash)"
if (-not $Force -and (Test-Path $stamp) -and ((Get-Content $stamp -Raw).Trim() -eq $want)) { Write-Host "build\python is current ($PyVersion). Use -Force to rebuild."; return }

$zip = Join-Path $env:TEMP "python-$PyVersion-embed-amd64.zip"
if (-not (Test-Path $zip)) {
  Write-Host "Downloading Python $PyVersion embeddable..."
  Invoke-WebRequest "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" -OutFile $zip
}
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower()
if ($PySha256 -eq 'TODO') {
  if (-not $AllowUnverified) { Remove-Item $zip; throw "PySha256 is still TODO. Downloaded zip SHA256 = $hash. Verify it against python.org, put it in this script, rerun (or pass -AllowUnverified)." }
  Write-Warning "UNVERIFIED download, SHA256 = $hash"
} elseif ($hash -ne $PySha256.ToLower()) { Remove-Item $zip; throw "SHA256 mismatch: got $hash, expected $PySha256" }

Write-Host 'Extracting...'
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
Expand-Archive $zip -DestinationPath $out

# enable site-packages (embeddable ships with "#import site" commented out)
$pth = Get-ChildItem $out -Filter 'python*._pth' | Select-Object -First 1
(Get-Content $pth.FullName) -replace '^#\s*import site', 'import site' | Set-Content $pth.FullName
if (-not (Select-String -Path $pth.FullName -Pattern '^import site' -Quiet)) { throw "could not enable 'import site' in $($pth.Name)" }

$py = Join-Path $out 'python.exe'
Write-Host 'Bootstrapping pip...'
# get-pip/pip 26.3 refuses to install itself on Windows unless run as `python -m pip`, so unpack the
# hash-checked wheel straight into site-packages (a wheel is a zip; pip is pure Python).
$whl = Join-Path $env:TEMP 'pip-26.3-py3-none-any.whl'
Invoke-WebRequest $PipWheelUrl -OutFile $whl
$wHash = (Get-FileHash $whl -Algorithm SHA256).Hash.ToLower()
if ($wHash -ne $PipWheelSha256) { Remove-Item $whl; throw "pip wheel SHA256 mismatch: got $wHash, expected $PipWheelSha256" }
$sp = Join-Path $out 'Lib\site-packages'
New-Item -ItemType Directory -Force $sp | Out-Null
& $py -I -c "import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" $whl $sp
if ($LASTEXITCODE) { throw 'pip wheel unpack failed' }

Write-Host 'Installing importer libs (hash-checked, wheels only)...'
& $py -I -m pip install --require-hashes --only-binary=:all: --no-warn-script-location -r $lock
if ($LASTEXITCODE) { throw 'pip install failed (a lib may have no cp313 win_amd64 wheel, or the lock is stale)' }

Write-Host 'Stripping caches/tests/pip...'
Get-ChildItem $out -Recurse -Directory -Include '__pycache__', 'tests', 'test' | Where-Object { $_.FullName -like '*\site-packages\*' } | Remove-Item -Recurse -Force
Get-ChildItem $out -Recurse -Filter '*.pyc' | Remove-Item -Force
# keep setuptools: pdfminer.six (via pdfplumber) can load pkg_resources at PDF-parse time, which the import smoke test wouldn't catch
& $py -I -m pip uninstall -y pip wheel
if ($LASTEXITCODE) { throw 'pip uninstall failed' }

# smoke test: the importer's imports must load from the bundle
& $py -I -c "import lxml.etree, pdfplumber, pypdfium2, PIL, cffi, cryptography, anthropic; print('imports ok')"
if ($LASTEXITCODE) { throw 'smoke import failed' }

Set-Content $stamp $want
Write-Host "Done: $out"
