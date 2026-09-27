import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { applySettings, loadSettings } from './ui/settings'

applySettings(loadSettings())

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
