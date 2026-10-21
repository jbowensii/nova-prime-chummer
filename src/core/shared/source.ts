// Catalog sources both games read: a source id's form and a data file as the loaders get it.

/** A source id (server/books.mjs SOURCE_ID). */
export const SOURCE_ID = /^[A-Z][A-Z0-9-]{0,19}$/

/** publisher, owner: a compendium's owner's name and account (its source's publisher, where to edit it) */
export interface SourceFile {
  file: string
  xml: string
  overlay: boolean
  publisher?: string
  owner?: string
}
