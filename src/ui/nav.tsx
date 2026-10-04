// Every page's header (0.9.1): the brand and title, then two rows of icons with tooltips. Row 1 is the same on every page
// of a game: the main menu in a fixed order (the current page underlined), then the game switch, Ask, Settings and the
// account. Row 2, only on a page that has any, holds that page's own actions. Pages a role can't use aren't listed
// (App.tsx sends them home anyway). On the Shadowrun 6 pages (#/sr6/...) the menu is SR6's and Ask is hidden (it answers from the
// Anarchy books).
import { Children, type ReactNode } from 'react'
import { AskButton } from './AskRules'
import { AccountMenu, canEdit, isAdmin, useMe } from './auth'
import { Brand } from './bits'
import { homeOf, storeGame } from './game'
import { IconLink, type IconName } from './icons'
import { useRepo } from './repo'
import { SettingsButton } from './settings'

export function MainMenu() {
  const me = useMe(), server = useRepo().mode === 'server'
  const [here, sub] = location.hash.replace(/^#\/?/, '').split('/')
  if (here === 'sr6') return <Bar section={sub === 'table' || sub === 'table-rules' ? 'sr6/table'
    : (sub === 'books' && isAdmin(me)) || sub === 'rules' || sub === 'data' || sub === 'campaigns' ? `sr6/${sub}`
    : (sub === 'npcs' || sub === 'n') && canEdit(me) ? 'sr6/npcs' : sub === 'compendiums' && canEdit(me) && server ? 'sr6/compendiums' : 'sr6'} sr6 items={[
    ['sr6', 'runners', 'Your runners', true],
    ['sr6/npcs', 'npcs', 'NPCs & Critters', canEdit(me)],
    ['sr6/compendiums', 'compendiums', 'Compendiums', canEdit(me) && server],
    ['sr6/campaigns', 'campaigns', 'Campaigns', server],
    ['sr6/books', 'books', 'Books', isAdmin(me)],
    ['sr6/rules', 'rules', 'Rules', true],
    ['sr6/data', 'data', 'Game data', true],
    ['sr6/table', 'table', 'Table setup', true],
  ]} />
  // a runner's or NPC's editor: its list; the old Table rules link and a player's #/rules: Table setup
  const section = here === 'c' ? '' : here === 'n' ? 'npcs' : here === 'table-rules' || (here === 'rules' && !canEdit(me)) ? 'table' : here
  return <Bar section={section} items={[
    ['', 'runners', 'Your runners', true],
    ['npcs', 'npcs', 'NPCs & Critters', canEdit(me)],
    ['compendiums', 'compendiums', 'Compendiums', canEdit(me) && server],
    ['campaigns', 'campaigns', 'Campaigns', server],
    ['books', 'books', 'Books', isAdmin(me)],
    ['rules', 'rules', 'Rules', canEdit(me)],
    ['data', 'data', 'Game data', true],
    ['table', 'table', 'Table setup', true],
  ]} />
}

function Bar({ items, section, sr6 }: { items: [string, IconName, string, boolean][]; section: string; sr6?: boolean }) {
  const other = sr6 ? 'ca2' : 'sr6'
  return (
    <div className="menubar">
      <nav aria-label="Main menu" className="iconbar">
        {items.filter(i => i[3]).map(([page, icon, label]) =>
          <IconLink key={page} href={`#/${page}`} icon={icon} label={label} aria-current={section === page ? 'page' : undefined} />)}
      </nav>
      <div className="iconbar tools">
        <IconLink href={homeOf(other)} icon="switch" label={sr6 ? 'Switch to Shadowrun Anarchy' : 'Switch to Shadowrun 6'} onClick={() => storeGame(other)} />
        {!sr6 && <AskButton />}<SettingsButton /><AccountMenu />
      </div>
    </div>
  )
}

/** The header's two rows: the main menu, then the page's own actions (children) when it has any. Also the editors' and
 *  the print page's. */
export function HeaderBars({ children }: { children?: ReactNode }) {
  return (
    <div className="bars">
      <MainMenu />
      {Children.toArray(children).length > 0 && <div className="iconbar actions" role="group" aria-label="Page actions">{children}</div>}
    </div>
  )
}

/** A page's header. children: the page's own actions (row 2). */
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="pagehead">
      <div className="titles"><Brand /><h1>{title}</h1></div>
      <HeaderBars>{children}</HeaderBars>
    </header>
  )
}
