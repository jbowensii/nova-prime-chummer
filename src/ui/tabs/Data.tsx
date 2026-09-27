import type { Catalog } from '../../model/types'

export function DataScreen({ c }: { c: Catalog }) {
  return (
    <main className="lib">
      <header><div style={{ flex: 1 }}><a className="brand" href="#/">Chummer <b>Anarchy</b> 2.0</a><h1>Game data</h1></div></header>
      <p>All rules and catalog data load from XML files next to this page. House rules and extra content go in the <code>custom/</code> folder
        (on Unraid: <code>/mnt/user/appdata/chummer-anarchy2/custom</code>), listed in <code>custom/index.xml</code>. Same id replaces a book entry,
        <code> &lt;remove id="…"/&gt;</code> deletes one, a new id adds one. Reload the page after changing them.</p>
      <h2>Problems</h2>
      {c.errors.length === 0 ? <p className="ok">Every file loaded cleanly.</p> : (
        <table className="data"><thead><tr><th>File</th><th>Line</th><th>Problem</th></tr></thead>
          <tbody>{c.errors.map((e, i) => <tr key={i}><td>{e.file}</td><td className="num">{e.line ?? ''}</td><td className="err">{e.message}</td></tr>)}</tbody></table>
      )}
      <h2 style={{ marginTop: '1.5rem' }}>Loaded files</h2>
      <table className="data"><thead><tr><th>File</th><th>Kind</th><th className="num">Entries</th><th>From</th></tr></thead>
        <tbody>{c.files.map(f => <tr key={f.file}><td>{f.file}</td><td>{f.kind}</td><td className="num">{f.entries}</td><td>{f.overlay ? 'custom overlay' : 'base data'}</td></tr>)}</tbody></table>
      <p className="muted" style={{ marginTop: '1rem' }}>The file format and schemas are documented in <code>docs/data-format.md</code> and <code>data/schema/</code>.</p>
    </main>
  )
}
