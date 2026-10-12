// XML text both games write (runner files, compendiums, catalog entries and edits): one escaper, so what XML 1.0 can't
// hold never makes a file unreadable.

/** What XML 1.0 can't hold (control characters pasted from a PDF, U+FFFE/FFFF, half a surrogate pair): dropped on
 *  write; a file that has them is refused on read, saying where, and "Try to repair" drops them. */
// eslint-disable-next-line no-control-regex
export const BAD_XML_CHAR = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
// a carriage return would read back as a line feed: kept as a character reference
export const esc = (s: string) => s.replace(BAD_XML_CHAR, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/\r/g, '&#13;')
// in an attribute, tabs and line breaks would read back as spaces
export const escAttr = (s: string) => esc(s).replace(/\t/g, '&#9;').replace(/\n/g, '&#10;')
