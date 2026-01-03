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
      }
    }
  }
}
