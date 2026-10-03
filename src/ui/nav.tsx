// Every page's header: the brand and title, the page's own actions, then the one main menu (icons with tooltips, the
// current page marked) and the game switch, Ask, Settings and the account. Pages a role can't use aren't listed (App.tsx
// sends them home anyway). On the Shadowrun 6 pages (#/sr6/...) the menu is SR6's and Ask is hidden (it answers from the
// Anarchy books).
import type { ReactNode } from 'react'
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
  if (here === 'sr6') return <Bar section={(sub === 'books' && isAdmin(me)) || sub === 'rules' || sub === 'data' ? `sr6/${sub}` : 'sr6'} sr6 items={[
    ['sr6', 'runners', 'Your runners', true],
    ['sr6/books', 'books', 'Books', isAdmin(me)],
    ['sr6/rules', 'rules', 'Rules', true],
    ['sr6/data', 'data', 'Game data', true],
  ]} />
  const section = here === 'c' ? '' : here === 'n' ? 'npcs' : here // a runner's or NPC's editor: its list
  return <Bar section={section} items={[
    ['', 'runners', 'Your runners', true],
    ['npcs', 'npcs', 'NPCs & Critters', canEdit(me)],
    ['compendiums', 'compendiums', 'Compendiums', canEdit(me) && server],
    ['campaigns', 'campaigns', 'Campaigns', server],
    ['books', 'books', 'Books', isAdmin(me)],
    canEdit(me) ? ['rules', 'rules', 'Rules', true] : ['table-rules', 'rules', 'Table rules', true],
    ['data', 'data', 'Game data', true],
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

/** A page's header. children: the page's own actions, before the main menu. */
export function PageHeader({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <header className="pagehead">
      <div className="titles"><Brand /><h1>{title}</h1></div>
      <div className="bars">
        {children && <div className="iconbar actions">{children}</div>}
        <MainMenu />
      </div>
    </header>
  )
}
