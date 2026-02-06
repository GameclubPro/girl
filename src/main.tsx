import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './telegram-emulator.css'
import App from './App.tsx'
import { setupTelegramEmulator } from './dev/telegramEmulator'

setupTelegramEmulator()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
