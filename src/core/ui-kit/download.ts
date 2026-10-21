/** Saves `body` as a file download named `name` (a Blob URL on a temporary link, released after the click). */
export function downloadFile(name: string, body: BlobPart, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }))
  Object.assign(document.createElement('a'), { href: url, download: name }).click()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
