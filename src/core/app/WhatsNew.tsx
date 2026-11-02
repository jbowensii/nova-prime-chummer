// "What's new" dialog: the newest CHANGELOG.md section as plain text (bundled at build time, so it works offline and in the
// desktop app). Opens itself once after an upgrade; Settings has a button for it on demand.
import { useState } from 'react'
import changelog from '../../../CHANGELOG.md?raw'
import { Modal } from '../ui-kit/bits'
import { newestSection, shouldShowOnce } from './changelog'

const section = newestSection(changelog)

export function WhatsNew({ openNow, onClose }: { openNow: boolean; onClose: () => void }) {
  const [auto, setAuto] = useState(() => !!section && shouldShowOnce(__APP_VERSION__))
  if (!section) return null
  const close = () => (setAuto(false), onClose())
  return (
    <Modal open={openNow || auto} onClose={close} title={`What’s new (v${__APP_VERSION__})`}>
      <pre style={{ whiteSpace: 'pre-wrap', font: 'inherit' }}>{section}</pre>
    </Modal>
  )
}
