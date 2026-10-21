import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './core/app/App'
import { applySettings, loadSettings } from './core/ui-kit/settings'
import { installTips } from './core/ui-kit/icons'

applySettings(loadSettings())
installTips()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
