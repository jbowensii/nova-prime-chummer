// Git-hook helper for Python style (CI runs `black --check importer tools && pylint importer tools`).
//   node tools/hook-py.mjs black <files...>   pre-commit: black --check on the staged files lint-staged passes
//   node tools/hook-py.mjs pylint             pre-push: pylint on .py files under importer/ tools/ changed vs the upstream
// A missing Python/black/pylint is a warning, never a failure (CI is the backstop).
import { spawnSync } from 'node:child_process'

const [tool, ...files] = process.argv.slice(2)
const run = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true })
const py = [['python'], ['py', '-3'], ['python3']].find(([c, ...p]) => run(c, [...p, '-m', tool, '--version']).status === 0)
if (!py) {
  console.warn(`hook: ${tool} not available (pip install -r importer/requirements-lint.txt); skipped, CI will check`)
  process.exit(0)
}
let targets = files
if (tool === 'pylint') {
  // ponytail: diff against the first base that exists; a new branch with no upstream compares to forgejo/main, then origin/main
  const base = ['@{u}', 'forgejo/main', 'origin/main'].find(b => run('git', ['rev-parse', '--verify', '-q', b]).status === 0)
  if (!base) process.exit(0)
  targets = run('git', ['diff', '--name-only', '--diff-filter=d', base, 'HEAD'])
    .stdout.split('\n')
    .filter(f => /^(importer|tools)\/.*\.py$/.test(f))
}
if (!targets.length) process.exit(0)
const [c, ...p] = py
const extra = tool === 'black' ? ['--check'] : []
process.exit(spawnSync(c, [...p, '-m', tool, ...extra, ...targets], { stdio: 'inherit', windowsHide: true }).status ?? 1)
