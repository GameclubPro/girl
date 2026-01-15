export {}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void
        expand: () => void
        close?: () => void
        requestFullscreen?: () => void
        openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
        openTelegramLink?: (url: string) => void
        setHeaderColor?: (color: string) => void
        setBackgroundColor?: (color: string) => void
        disableVerticalSwipes?: () => void
        BackButton?: {
          show: () => void
          hide: () => void
          onClick: (callback: () => void) => void
          offClick: (callback: () => void) => void
        }
        initDataUnsafe?: {
          user?: {
            id: number
            first_name?: string
            last_name?: string
            username?: string
            language_code?: string
          }
          start_param?: string
        }
        safeAreaInset?: { top: number; bottom: number; left: number; right: number }
        contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number }
        onEvent?: (eventType: string, callback: () => void) => void
        offEvent?: (eventType: string, callback: () => void) => void
      }
    }
  }
}
