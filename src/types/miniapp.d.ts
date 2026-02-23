export {}

declare global {
  interface Window {
    __miniAppHost?: 'telegram' | 'vk' | 'max' | 'web'
    __vkBridgeCleanup?: () => void
    __vkEmulatorCleanup?: () => void
    __vkLaunchParams?: Record<string, string>
    __maxBridgeCleanup?: () => void
    __maxLaunchParams?: Record<string, string>
    WebApp?: {
      InitData?: string
      initData?: string
      platform?: string
      version?: string
      ready?: () => void
      expand?: () => void
      requestFullscreen?: () => void
      disableVerticalSwipes?: () => void
      close?: () => void
      openLink?: (url: string) => void
      haptics?: {
        impactOccurred?: (
          style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
        ) => void
        notificationOccurred?: (
          style: 'success' | 'warning' | 'error'
        ) => void
        selectionChanged?: () => void
      }
    }
  }
}
