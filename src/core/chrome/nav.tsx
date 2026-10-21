// Every page's header (0.9.1): the brand and title, then two rows of icons with tooltips. Row 1 is the same on every page
// of a game: the main menu in a fixed order (the current page underlined), then the Foundry export link (on every page, for
// those who may export), the game switch, Ask, Settings and the account (and a page's own tools). Row 2, only on a page that has any, holds that page's own actions. Pages a role can't use aren't listed
// (App.tsx sends them home anyway). On the Shadowrun 6 pages (#/sr6/...) the menu is SR6's and Ask asks SR6's own AI
// (its books, its settings; shown once the admin sets it up).
import { Children, createContext, useContext, type ComponentType, type CSSProperties, type ReactNode } from 'react'
import { AccountMenu, canEdit, isAdmin, useMe } from '../ui-kit/auth'
import { Brand } from '../ui-kit/bits'
import { homeOf, storeGame } from '../ui-kit/game'
import { IconLink, type IconName } from '../ui-kit/icons'

/** What the app shell (App.tsx) supplies to every header: whether the server is in use, and the feature buttons (Ask, Settings)
 *  that sit in row 1. This file imports no feature; without a provider the header just has neither button. */
export interface HeaderBarsValue {
  server: boolean
  Ask?: ComponentType<{ game: 'ca2' | 'sr6' }>
  Settings?: ComponentType
}
export const HeaderBarsContext = createContext<HeaderBarsValue>({ server: false })

/** The Foundry export's fold on Game data (src/features/catalog-browser/GameData.tsx) */
export const FOUNDRY = 'foundry-export'
/** Unfold the Foundry export and bring it into view (its header link; a page opened at …/data/foundry). */
export function showFoundry() {
  const d = document.getElementById(FOUNDRY) as HTMLDetailsElement | null
  if (!d) return
  d.open = true
  d.scrollIntoView({ block: 'start' })
  d.querySelector('summary')?.focus({ preventScroll: true })
}

/** tools: the page's own icons at the start of row 1's right-hand group. */
export function MainMenu({ tools }: { tools?: ReactNode } = {}) {
  const me = useMe(),
    { server } = useContext(HeaderBarsContext)
  const [here, sub] = location.hash.replace(/^#\/?/, '').split('/')
  if (here === 'sr6')
    return (
      <Bar
        section={
          sub === 'table' || sub === 'table-rules'
            ? 'sr6/table'
            : (sub === 'books' && isAdmin(me)) || sub === 'rules' || sub === 'data' || sub === 'campaigns'
              ? `sr6/${sub}`
              : (sub === 'npcs' || sub === 'n') && canEdit(me)
                ? 'sr6/npcs'
                : sub === 'designs' && server
                  ? 'sr6/designs'
                  : sub === 'compendiums' && canEdit(me) && server
                    ? 'sr6/compendiums'
                    : 'sr6'
        }
        sr6
        tools={tools}
        items={[
          ['sr6', 'runners', 'Your runners', true],
          ['sr6/designs', 'designs', 'Designer', server],
          ['sr6/npcs', 'npcs', 'NPCs & Critters', canEdit(me)],
          ['sr6/compendiums', 'compendiums', 'Compendiums', canEdit(me) && server],
          ['sr6/campaigns', 'campaigns', 'Campaigns', server],
          ['sr6/books', 'books', 'Books', isAdmin(me)],
          ['sr6/rules', 'rules', 'Rules', true],
          ['sr6/data', 'data', 'Game data', true],
          ['sr6/table', 'table', 'Table setup', true],
        ]}
      />
    )
  // a runner's or NPC's editor: its list; the old Table rules link and a player's #/rules: Table setup
  const section = here === 'c' ? '' : here === 'n' ? 'npcs' : here === 'table-rules' || (here === 'rules' && !canEdit(me)) ? 'table' : here
  return (
    <Bar
      section={section}
      tools={tools}
      items={[
        ['', 'runners', 'Your runners', true],
        ['npcs', 'npcs', 'NPCs & Critters', canEdit(me)],
        ['compendiums', 'compendiums', 'Compendiums', canEdit(me) && server],
        ['campaigns', 'campaigns', 'Campaigns', server],
        ['books', 'books', 'Books', isAdmin(me)],
        ['rules', 'rules', 'Rules', canEdit(me)],
        ['data', 'data', 'Game data', true],
        ['table', 'table', 'Table setup', true],
      ]}
    />
  )
}

function Bar({ items, section, sr6, tools }: { items: [string, IconName, string, boolean][]; section: string; sr6?: boolean; tools?: ReactNode }) {
  const other = sr6 ? 'ca2' : 'sr6',
    me = useMe(),
    { Ask, Settings } = useContext(HeaderBarsContext),
    shown = items.filter(i => i[3])
  // on a phone the icons sit in an even grid: up to 6 in one row, more in two rows of equal length (no lone icon on a row)
  const cols = shown.length <= 6 ? shown.length : Math.ceil(shown.length / 2)
  return (
    <div className="menubar">
      <nav aria-label="Main menu" className="iconbar" style={{ '--cols': cols } as CSSProperties}>
        {shown.map(([page, icon, label]) => (
          <IconLink key={page} href={`#/${page}`} icon={icon} label={label} aria-current={section === page ? 'page' : undefined} />
        ))}
      </nav>
      <div className="iconbar tools">
        {tools}
        {canEdit(me) && <IconLink href={`#/${sr6 ? 'sr6/' : ''}data/foundry`} icon="foundry" label="Export book data for Foundry" onClick={showFoundry} />}
        <IconLink href={homeOf(other)} icon="switch" label={sr6 ? 'Switch to Shadowrun Anarchy' : 'Switch to Shadowrun 6'} onClick={() => storeGame(other)} />
        {Ask && <Ask game={sr6 ? 'sr6' : 'ca2'} />}
        {Settings && <Settings />}
        <AccountMenu />
      </div>
    </div>
  )
}

/** The header's two rows: the main menu, then the page's own actions (children) when it has any. Also the editors' and
 *  the print page's. */
export function HeaderBars({ children, tools }: { children?: ReactNode; tools?: ReactNode }) {
  return (
    <div className="bars">
      <MainMenu tools={tools} />
      {Children.toArray(children).length > 0 && (
        <div className="iconbar actions" role="group" aria-label="Page actions">
          {children}
        </div>
      )}
    </div>
  )
}

/** A page's header. children: the page's own actions (row 2); tools: its icons in row 1's right-hand group. */
export function PageHeader({ title, children, tools }: { title: ReactNode; children?: ReactNode; tools?: ReactNode }) {
  return (
    <header className="pagehead">
      <div className="titles">
        <Brand />
        <h1>{title}</h1>
      </div>
      <HeaderBars tools={tools}>{children}</HeaderBars>
    </header>
  )
}
