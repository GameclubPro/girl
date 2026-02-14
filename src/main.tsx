import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './telegram-emulator.css'
import App from './App.tsx'
import { setupTelegramEmulator } from './dev/telegramEmulator'
import { setupMiniAppBridge } from './platform/miniAppBridge'

const bootstrap = async () => {
  await setupMiniAppBridge()
  setupTelegramEmulator()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
