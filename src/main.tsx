import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './telegram-emulator.css'
import './vk-emulator.css'
import './max-emulator.css'
import App from './App.tsx'
import { setupTelegramEmulator } from './dev/telegramEmulator'
import { setupVkEmulator } from './dev/vkEmulator'
import { setupMaxEmulator } from './dev/maxEmulator'
import { setupMiniAppBridge } from './platform/miniAppBridge'

const bootstrap = async () => {
  await setupMiniAppBridge()
  setupTelegramEmulator()
  setupVkEmulator()
  setupMaxEmulator()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
