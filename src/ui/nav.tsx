// Every page's header: the brand and title, the page's own actions, then the one main menu (icons with tooltips, the
// current page marked) and Ask, Settings and the account. Pages a role can't use aren't listed (App.tsx sends them home anyway).
import type { ReactNode } from 'react'
import { AskButton } from './AskRules'
import { AccountMenu, canEdit, isAdmin, useMe } from './auth'
import { Brand } from './bits'
import { IconLink, type IconName } from './icons'
import { useRepo } from './repo'
import { SettingsButton } from './settings'

export function MainMenu() {
  const me = useMe(), server = useRepo().mode === 'server'
  const here = location.hash.replace(/^#\/?/, '').split('/')[0]
  const section = here === 'c' ? '' : here === 'n' ? 'npcs' : here // a runner's or NPC's editor: its list
  const items: [string, IconName, string, boolean][] = [
    ['', 'runners', 'Your runners', true],
    ['npcs', 'npcs', 'NPCs & Critters', canEdit(me)],
    ['compendiums', 'compendiums', 'Compendiums', canEdit(me) && server],
    ['campaigns', 'campaigns', 'Campaigns', server],
    ['books', 'books', 'Books', isAdmin(me)],
    canEdit(me) ? ['rules', 'rules', 'Rules', true] : ['table-rules', 'rules', 'Table rules', true],
    ['data', 'data', 'Game data', true],
  ]
  return (
    <div className="menubar">
      <nav aria-label="Main menu" className="iconbar">
        {items.filter(i => i[3]).map(([page, icon, label]) =>
          <IconLink key={page} href={`#/${page}`} icon={icon} label={label} aria-current={section === page ? 'page' : undefined} />)}
      </nav>
      <div className="iconbar tools"><AskButton /><SettingsButton /><AccountMenu /></div>
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
