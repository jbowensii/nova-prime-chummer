import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { applySettings, loadSettings } from './ui/settings'
import { installTips } from './ui/icons'

applySettings(loadSettings())
installTips()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
