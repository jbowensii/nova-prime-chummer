// Ordered upgrade steps for the SR6 runner file (charxml.ts). Step i turns a format (i + 1) file into format (i + 2) and
// FORMAT_VERSION is 1 + the number of steps, so adding a step bumps it.
//
// RULES: never edit or reorder a shipped step, only append. Each step mutates the parsed <character> element in place
// (attributes and child elements as written on disk), before the reader sees it. Update character.xsd with the step.
// DATA SAFETY: before the first real step ships, have the server back up runner files before they are re-saved in the
// new format (an upgrade is one-way: an older app refuses the newer file).

/** One upgrade step: rewrite the <character> element from one format version to the next. */
export type Sr6Migration = (root: Element) => void

export const SR6_MIGRATIONS: readonly Sr6Migration[] = []

/** Runs the steps from `from` up to 1 + steps.length and stamps the new formatVersion on the root. */
export function upgradeSr6(root: Element, from: number, steps: readonly Sr6Migration[] = SR6_MIGRATIONS): void {
  for (let v = from; v < 1 + steps.length; v++) {
    steps[v - 1](root)
    root.setAttribute('formatVersion', String(v + 1))
  }
}
