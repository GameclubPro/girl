import bridge from '@vkontakte/vk-bridge'
import { getMiniAppHost } from '../platform/miniAppHost'

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
type NotificationStyle = 'success' | 'warning' | 'error'

const impactStyleMap: Record<ImpactStyle, 'light' | 'medium' | 'heavy'> = {
  light: 'light',
  medium: 'medium',
  heavy: 'heavy',
  rigid: 'heavy',
  soft: 'light',
}

export const hapticImpact = (style: ImpactStyle = 'light') => {
  const telegramHaptics = window.Telegram?.WebApp?.HapticFeedback
  if (telegramHaptics?.impactOccurred) {
    telegramHaptics.impactOccurred(style)
    return
  }
  if (getMiniAppHost() !== 'vk') return
  void bridge
    .send('VKWebAppTapticImpactOccurred', { style: impactStyleMap[style] })
    .catch(() => {})
}

export const hapticSelection = () => {
  const telegramHaptics = window.Telegram?.WebApp?.HapticFeedback
  if (telegramHaptics?.selectionChanged) {
    telegramHaptics.selectionChanged()
    return
  }
  if (getMiniAppHost() !== 'vk') return
  void bridge.send('VKWebAppTapticSelectionChanged').catch(() => {})
}

export const hapticNotification = (style: NotificationStyle) => {
  const telegramHaptics = window.Telegram?.WebApp?.HapticFeedback
  if (telegramHaptics?.notificationOccurred) {
    telegramHaptics.notificationOccurred(style)
    return
  }
  if (getMiniAppHost() !== 'vk') return
  void bridge
    .send('VKWebAppTapticNotificationOccurred', { type: style })
    .catch(() => {})
}
