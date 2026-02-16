export {}

declare global {
  interface Window {
    __miniAppHost?: 'telegram' | 'vk' | 'web'
    __vkBridgeCleanup?: () => void
    __vkLaunchParams?: Record<string, string>
  }
}
