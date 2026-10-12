// The Python that runs the importer: $PYTHON, else `py -3.12` (Windows launcher), `python3`, `python`, the first
// that has the importer's requirements. Run directly: the importer's unittest suite (npm run test:py).
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

export function findPython() {
  const tries = [process.env.PYTHON?.split(' '), ['py', '-3.12'], ['python3'], ['python']].filter(Boolean)
  return tries.find(([cmd, ...pre]) =>
    spawnSync(cmd, [...pre, '-c', 'import pdfplumber, pypdfium2, anthropic, lxml'], { stdio: 'ignore', windowsHide: true }).status === 0) ?? null
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const py = findPython()
  if (!py) {
    console.error('No Python with the importer requirements found. Install Python 3.12 and `pip install --require-hashes -r importer/requirements.lock`, or set PYTHON.')
    process.exit(1)
  }
  const [cmd, ...pre] = py
  process.exit(spawnSync(cmd, [...pre, '-m', 'unittest', 'discover', '-s', 'importer/tests', '-t', '.', ...process.argv.slice(2)], { stdio: 'inherit' }).status ?? 1)
}
