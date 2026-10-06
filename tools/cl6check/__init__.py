"""cl6check: measure our SR6 imports against Commlink6, the system of record (docs/cl6check.md).

It reads the owner's installed Commlink6 jar at run time and never stores any of its data: reader (the jar), canon
(a Commlink6 record in our vocabulary, formulas evaluated per rating), ours (an import's catalog in the same shape),
match, fields (per-field comparators), arbitrate (the PDF settles a difference), report (metrics, causes, baseline
deltas). Run: python -m tools.cl6check --help."""
