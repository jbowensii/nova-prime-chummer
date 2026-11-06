/** Another program can take a free port between the probe and the server's listen, so a port that's taken gets a new pick. */
export async function withPortRetry(pick, start, tries = 3) {
  for (let left = tries; ; left--) {
    const port = await pick()
    try {
      await start(port)
      return port
    } catch (e) {
      if (left <= 1 || !/EADDRINUSE/.test(e.message)) throw e
    }
  }
}
