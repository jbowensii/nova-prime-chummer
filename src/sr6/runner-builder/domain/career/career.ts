// Career play (S3): a TypeScript port of SR6 Forge's advancement engine (advancement-engine.mjs preview) and its
// append-only ledger (services/ledger.mjs). ch.build stays as finalized; the runner as it stands is that build with every
// live advance since the last Finalize replayed on it, so undo is a void entry that replay skips (only the newest live
// advance may be voided, so no later entry ever sits on something gone). Every price, cap and rate is a creation setting
// (the Karma prices group doubles as the career prices, plus the Advancement group); an unset price refuses its spend
// naming the setting (`unset:<key>`), an unset cap is no cap. No book numbers. A prerequisite the runner lacks never
// refuses a spend (owner, 2026-10-09): it is recorded, and Review's error stands until a GM approves it.
export { sinceFinalize, voidedIds, liveAdvances, addonUpgradeProblem, applyAdvance, currentBuild } from './career-replay'
export { ledgerRows, ledgerLabel, balances, debtAmount, setDebtPercent } from './career-balance'
export type { LedgerRow } from './career-balance'
export { stolenLeft, careerPowerPoints, preview } from './career-pricing'
export type { Preview, Typed } from './career-pricing'
export { record, earn, note, editEntry, voidEntry, voidableIds, deleteEntry, deletableIds, clearHistory, canDraft } from './career-ledger'
export type { LedgerEdit } from './career-ledger'
export { validateCareer } from './career-validate'
