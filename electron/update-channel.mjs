// The only channels main accepts from the window (electron-updater: 'latest' = Stable, 'beta' = Testing prereleases).
export const channelOf = c => {
  if (c !== 'latest' && c !== 'beta') throw new Error('bad update channel')
  return c
}
