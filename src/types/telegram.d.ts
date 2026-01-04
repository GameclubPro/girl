export {}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void
        expand: () => void
        requestFullscreen?: () => void
        setHeaderColor?: (color: string) => void
        setBackgroundColor?: (color: string) => void
        disableVerticalSwipes?: () => void
        initDataUnsafe?: {
          user?: {
            id: number
          }
        }
        safeAreaInset?: { top: number; bottom: number; left: number; right: number }
        contentSafeAreaInset?: { top: number; bottom: number; left: number; right: number }
        onEvent?: (eventType: string, callback: () => void) => void
        offEvent?: (eventType: string, callback: () => void) => void
      }
    }
  }
}
