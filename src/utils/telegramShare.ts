import bridge from '@vkontakte/vk-bridge'
import { getMiniAppHost } from '../platform/miniAppHost'

const appendOrReplaceQueryParam = (
  base: string,
  key: string,
  encodedValue: string
) => {
  const pattern = new RegExp(`([?&])${key}=[^&#]*`, 'i')
  if (pattern.test(base)) {
    return base.replace(pattern, `$1${key}=${encodedValue}`)
  }
  const joiner = base.includes('?') ? '&' : '?'
  return `${base}${joiner}${key}=${encodedValue}`
}

export const buildShareLink = (base: string, startParam: string) => {
  const trimmedBase = base.trim()
  const trimmedParam = startParam.trim()
  if (!trimmedBase || !trimmedParam) return ''
  const encodedParam = encodeURIComponent(trimmedParam)
  const host = getMiniAppHost()
  if (host === 'telegram' || host === 'max') {
    return appendOrReplaceQueryParam(trimmedBase, 'startapp', encodedParam)
  }
  return appendOrReplaceQueryParam(trimmedBase, 'start', encodedParam)
}

export const buildTelegramShareUrl = (link: string, text: string) => {
  const host = getMiniAppHost()
  const params = new URLSearchParams()
  params.set('url', link)
  if (text.trim()) {
    if (host === 'vk') {
      params.set('title', text.trim())
    } else {
      params.set('text', text)
    }
  }
  if (host === 'vk') {
    return `https://vk.com/share.php?${params.toString()}`
  }
  return `https://t.me/share/url?${params.toString()}`
}

export const resolveShareBaseUrl = () => {
  const host = getMiniAppHost()
  if (host === 'max') {
    return (import.meta.env.VITE_MAX_APP_URL ?? '').trim()
  }
  if (host === 'vk') {
    return (import.meta.env.VITE_VK_APP_URL ?? '').trim()
  }
  if (host === 'telegram') {
    return (import.meta.env.VITE_TG_APP_URL ?? '').trim()
  }
  return (
    (import.meta.env.VITE_TG_APP_URL ??
      import.meta.env.VITE_MAX_APP_URL ??
      import.meta.env.VITE_VK_APP_URL ??
      '') as string
  ).trim()
}

export const resolveShareEnvHint = () => {
  const host = getMiniAppHost()
  if (host === 'max') {
    return 'Добавьте VITE_MAX_APP_URL, чтобы открыть MAX Mini App.'
  }
  if (host === 'vk') {
    return 'Добавьте VITE_VK_APP_URL, чтобы включить ссылку во ВКонтакте.'
  }
  if (host === 'telegram') {
    return 'Добавьте VITE_TG_APP_URL, чтобы открыть Telegram.'
  }
  return 'Добавьте VITE_TG_APP_URL, VITE_VK_APP_URL или VITE_MAX_APP_URL.'
}

export const copyToClipboard = async (value: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
      return true
    }
    const textarea = document.createElement('textarea')
    textarea.value = value
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    const success = document.execCommand('copy')
    document.body.removeChild(textarea)
    return success
  } catch (error) {
    return false
  }
}

export const openTelegramLink = (url: string) => {
  const webApp = window.Telegram?.WebApp
  const host = getMiniAppHost()
  if (host === 'vk' || host === 'max') {
    if (webApp?.openLink) {
      webApp.openLink(url)
    } else {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
    return
  }
  if (webApp?.openTelegramLink) {
    webApp.openTelegramLink(url)
  } else if (webApp?.openLink) {
    webApp.openLink(url)
  } else {
    window.open(url, '_blank', 'noopener,noreferrer')
  }
  if (webApp?.close) {
    window.setTimeout(() => webApp.close?.(), 250)
  }
}

export const openShareLink = async (shareLink: string, text: string) => {
  const normalizedLink = shareLink.trim()
  if (!normalizedLink) return false
  const host = getMiniAppHost()

  if (host === 'vk') {
    try {
      await bridge.send('VKWebAppShare', { link: normalizedLink })
      return true
    } catch (_error) {
      const fallbackUrl = buildTelegramShareUrl(normalizedLink, text)
      openTelegramLink(fallbackUrl)
      return false
    }
  }

  if (host === 'max') {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'BEAUTERA',
          text: text.trim() || undefined,
          url: normalizedLink,
        })
        return true
      } catch (_error) {
        // continue with copy/link fallback
      }
    }
    const payload = `${text}\n${normalizedLink}`.trim()
    const copied = await copyToClipboard(payload || normalizedLink)
    if (!copied) {
      openTelegramLink(normalizedLink)
    }
    return copied
  }

  const shareUrl = buildTelegramShareUrl(normalizedLink, text)
  openTelegramLink(shareUrl)
  return true
}
