import { useEffect, useState } from 'react'

type ThemeParams = {
  bg_color?: string
  secondary_bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
}

type Rgb = { r: number; g: number; b: number }

const normalizeColor = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (!trimmed) return fallback
  if (trimmed.startsWith('#') || trimmed.startsWith('rgb')) {
    return trimmed
  }
  return `#${trimmed}`
}

const hexToRgb = (hex: string): Rgb | null => {
  const normalized = hex.replace('#', '')
  if (normalized.length === 3) {
    const r = Number.parseInt(normalized[0] + normalized[0], 16)
    const g = Number.parseInt(normalized[1] + normalized[1], 16)
    const b = Number.parseInt(normalized[2] + normalized[2], 16)
    if ([r, g, b].some((value) => Number.isNaN(value))) return null
    return { r, g, b }
  }
  if (normalized.length === 6) {
    const r = Number.parseInt(normalized.slice(0, 2), 16)
    const g = Number.parseInt(normalized.slice(2, 4), 16)
    const b = Number.parseInt(normalized.slice(4, 6), 16)
    if ([r, g, b].some((value) => Number.isNaN(value))) return null
    return { r, g, b }
  }
  return null
}

const rgbFromColor = (value: string): Rgb | null => {
  if (value.startsWith('#')) {
    return hexToRgb(value)
  }
  const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)/i)
  if (!match) return null
  const r = Number.parseInt(match[1] ?? '', 10)
  const g = Number.parseInt(match[2] ?? '', 10)
  const b = Number.parseInt(match[3] ?? '', 10)
  if ([r, g, b].some((channel) => Number.isNaN(channel))) return null
  return { r, g, b }
}

const toRgbValue = (rgb: Rgb | null) =>
  rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : ''

const toHex = (rgb: Rgb) =>
  `#${[rgb.r, rgb.g, rgb.b]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`

const darken = (rgb: Rgb, ratio: number) => ({
  r: Math.max(0, Math.min(255, Math.round(rgb.r * ratio))),
  g: Math.max(0, Math.min(255, Math.round(rgb.g * ratio))),
  b: Math.max(0, Math.min(255, Math.round(rgb.b * ratio))),
})

export const useTelegramTheme = () => {
  const [themeVersion, setThemeVersion] = useState(0)

  useEffect(() => {
    const webApp = window.Telegram?.WebApp
    if (!webApp) return undefined
    const root = document.documentElement

    const applyTheme = () => {
      const params = (webApp.themeParams ?? {}) as ThemeParams
      const bg = normalizeColor(params.bg_color, '#ffffff')
      const secondary = normalizeColor(params.secondary_bg_color, '#f3f5f9')
      const text = normalizeColor(params.text_color, '#111827')
      const hint = normalizeColor(params.hint_color, '#5b6472')
      const link = normalizeColor(params.link_color, '#3b6db0')
      const button = normalizeColor(params.button_color, link)
      const buttonText = normalizeColor(params.button_text_color, '#ffffff')
      const accentRgb = rgbFromColor(button) ?? rgbFromColor('#3b6db0')
      const textRgb = rgbFromColor(text) ?? rgbFromColor('#111827')
      const hintRgb = rgbFromColor(hint) ?? rgbFromColor('#5b6472')
      const surfaceRgb = rgbFromColor(bg) ?? rgbFromColor('#ffffff')
      const surfaceMutedRgb = rgbFromColor(secondary) ?? rgbFromColor('#f3f5f9')
      const accentStrong = accentRgb ? toHex(darken(accentRgb, 0.78)) : '#2b4b86'

      root.style.setProperty('--tg-bg', bg)
      root.style.setProperty('--tg-secondary-bg', secondary)
      root.style.setProperty('--tg-text', text)
      root.style.setProperty('--tg-hint', hint)
      root.style.setProperty('--tg-link', link)
      root.style.setProperty('--tg-button', button)
      root.style.setProperty('--tg-button-text', buttonText)
      root.style.setProperty('--tg-scheme', webApp.colorScheme ?? 'light')
      root.style.setProperty('--accent-strong', accentStrong)

      if (accentRgb) root.style.setProperty('--accent-rgb', toRgbValue(accentRgb))
      if (textRgb) root.style.setProperty('--ink-rgb', toRgbValue(textRgb))
      if (hintRgb) root.style.setProperty('--muted-rgb', toRgbValue(hintRgb))
      if (surfaceRgb) {
        const rgbValue = toRgbValue(surfaceRgb)
        root.style.setProperty('--paper-rgb', rgbValue)
        root.style.setProperty('--surface-rgb', rgbValue)
      }
      if (surfaceMutedRgb) {
        root.style.setProperty('--surface-muted-rgb', toRgbValue(surfaceMutedRgb))
      }

      webApp.setHeaderColor?.(bg)
      webApp.setBackgroundColor?.(bg)
      setThemeVersion((current) => current + 1)
    }

    applyTheme()
    webApp.onEvent?.('themeChanged', applyTheme)
    return () => {
      webApp.offEvent?.('themeChanged', applyTheme)
    }
  }, [])

  return themeVersion
}
