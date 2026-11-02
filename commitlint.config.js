// Conventional commits (feat(sr6): ..., fix: ..., chore(ci): ...); scopes are free. Merge/revert commits are ignored by default.
export default {
  extends: ['@commitlint/config-conventional'],
  rules: { 'header-max-length': [0], 'subject-case': [0], 'body-max-line-length': [0], 'footer-max-line-length': [0] },
}
