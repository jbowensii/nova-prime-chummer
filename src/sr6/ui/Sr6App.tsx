// The Shadowrun 6 side (#/sr6/...), a shell until the core rulebook import (S1) and the builder (S2): an empty runner
// list and, for the admin, the Books page that import will use. No API calls and no catalog yet.
import { isAdmin, useMe } from '../../ui/auth'
import { Icon } from '../../ui/icons'
import { PageHeader } from '../../ui/nav'
import { RepoContext, type Repo } from '../../ui/repo'

export function Sr6Main({ repo, route }: { repo: Repo; route: string[] }) {
  const books = route[0] === 'books' && isAdmin(useMe())
  return (
    <RepoContext.Provider value={repo}>
      <main className="lib">
        {books ? <>
          <PageHeader title="Books">
            {/* aria-disabled, not disabled: it stays focusable, so its tooltip says why on keyboard focus too */}
            <button type="button" className="btn quiet ibtn" aria-disabled="true" aria-label="Upload a book"
              data-tip="SR6 book import comes in the next update"><Icon name="upload" /></button>
          </PageHeader>
          <div className="empty"><p>No SR6 books yet.</p><p className="muted">Importing the SR6 core rulebook comes in the next update.</p></div>
        </> : <>
          <PageHeader title="Your runners" />
          <div className="empty"><p>SR6 builder coming. Your Shadowrun 6 runners will be listed here.</p></div>
        </>}
      </main>
    </RepoContext.Provider>
  )
}
