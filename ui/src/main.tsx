import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './lib/theme'
import './styles.css'

initTheme()

// Install before React mounts and use capture so WebKit never reaches its
// native text-edit context menu (which otherwise appears as a stray “Paste”
// popup over ordinary controls). Do not synthesize a click: WebKit still sends
// the normal click event, and creating another one can double-activate buttons.
window.addEventListener(
  'contextmenu',
  (event) => {
    event.preventDefault()
  },
  { capture: true },
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
