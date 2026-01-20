type ImpactStyle = 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'
type NotificationStyle = 'success' | 'warning' | 'error'

export const hapticImpact = (style: ImpactStyle = 'light') => {
  window.Telegram?.WebApp?.HapticFeedback?.impactOccurred?.(style)
}

export const hapticSelection = () => {
  window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()
}

export const hapticNotification = (style: NotificationStyle) => {
  window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred?.(style)
}
