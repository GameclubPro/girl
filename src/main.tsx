import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './telegram-emulator.css'
import './vk-emulator.css'
import App from './App.tsx'
import { setupTelegramEmulator } from './dev/telegramEmulator'
import { setupVkEmulator } from './dev/vkEmulator'
import { setupMiniAppBridge } from './platform/miniAppBridge'

const bootstrap = async () => {
  await setupMiniAppBridge()
  setupTelegramEmulator()
  setupVkEmulator()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
