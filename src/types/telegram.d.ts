export {}

declare global {
  type TelegramThemeParams = {
    bg_color?: string
    text_color?: string
    hint_color?: string
    link_color?: string
    button_color?: string
    button_text_color?: string
    secondary_bg_color?: string
    section_bg_color?: string
    section_header_text_color?: string
    accent_text_color?: string
    destructive_text_color?: string
    header_bg_color?: string
    [key: string]: string | undefined
  }

  type TelegramInsets = { top: number; bottom: number; left: number; right: number }

  type TelegramMainButton = {
    show: () => void
    hide: () => void
    enable: () => void
    disable: () => void
    showProgress: () => void
    hideProgress: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
    setText: (text: string) => void
    color?: string
    textColor?: string
    isVisible?: boolean
    isActive?: boolean
  }

  type TelegramBackButton = {
    show: () => void
    hide: () => void
    onClick: (callback: () => void) => void
    offClick: (callback: () => void) => void
    isVisible?: boolean
  }

  type TelegramWebApp = {
    ready: () => void
    expand: () => void
    close?: () => void
    requestFullscreen?: () => void
    exitFullscreen?: () => void
    openLink?: (url: string, options?: { try_instant_view?: boolean }) => void
    openTelegramLink?: (url: string) => void
    disableVerticalSwipes?: () => void
    enableClosingConfirmation?: () => void
    disableClosingConfirmation?: () => void
    setHeaderColor?: (colorKey: string) => void
    setBackgroundColor?: (color: string) => void
    setBottomBarColor?: (color: string) => void
    platform?: string
    version?: string
    colorScheme?: 'light' | 'dark'
    isExpanded?: boolean
    isFullscreen?: boolean
    isClosingConfirmationEnabled?: boolean
    viewportHeight?: number
    viewportStableHeight?: number
    themeParams?: TelegramThemeParams
    MainButton?: TelegramMainButton
    HapticFeedback?: {
      impactOccurred?: (
        style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
      ) => void
      notificationOccurred?: (
        style: 'success' | 'warning' | 'error'
      ) => void
      selectionChanged?: () => void
    }
    BackButton?: TelegramBackButton
    initDataUnsafe?: {
      user?: {
        id: number
        first_name?: string
        last_name?: string
        username?: string
        language_code?: string
        photo_url?: string
      }
      start_param?: string
    }
    safeAreaInset?: TelegramInsets
    contentSafeAreaInset?: TelegramInsets
    onEvent?: (eventType: string, callback: (...args: unknown[]) => void) => void
    offEvent?: (eventType: string, callback: (...args: unknown[]) => void) => void
  }

  interface Window {
    Telegram?: {
      WebApp: TelegramWebApp
    }
  }
}
