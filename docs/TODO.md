# To do

- **Data pack import has no confirmation dialog.** Uploading one replaces the
  server's core tables at once; the Books page copy says so, but a
  restore-style preview (like Backup's) could be added if that's ever a
  problem in practice.
- **Complex-form price can't be overridden per book.** The CRB import writes
  it equal to the spell price (documented in `docs/data-format.md`); a book
  can't yet partly override core pricing.
- **AI fallback for unreadable core tables covers weapons and armor only**
  (recorded in `importer/recipes/crb.md`); the other core tables still need a
  human to fill them in by hand if the recipe can't read them.
- **Users page can't rename a username** (only name/email/role/method); the
  server already supports it, the UI form just doesn't expose it yet.
