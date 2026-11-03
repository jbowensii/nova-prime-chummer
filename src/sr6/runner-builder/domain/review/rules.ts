// Creation rules, Review's checks (a port of SR6 Forge's rules.mjs): a table of checks over the build and its budgets.
// Each violation cites the creation setting it rests on (its source and page) or the catalog entry it's about; its path's
// first segment is the editor tab (attributes.bod, skills.<id>, qualities.<uid>, gear.<uid>…). A rule whose setting is
// unset is skipped and Review warns once per setting (setting.unset). Errors block Finalize unless a GM approves them.
// A prerequisite the runner lacks is always an error, cited to the page that prints it (owner, 2026-10-09): the editor
// and the Ledger let it be taken, and the error stands until it's met or a GM approves it.

export { DESIGN_APPROVAL, PRICE_APPROVAL, CUSTOM_APPROVAL, GM_APPROVALS, ammoKinds } from './context'
export { CAREER_KEEP, validateSr6, canFinalizeSr6 } from './validate'
