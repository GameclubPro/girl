const SUPPORTED_HOSTS = new Set(['telegram', 'vk', 'max'])

const ensureParam = (searchParams, key, value) => {
  if (!searchParams.has(key) || !searchParams.get(key)) {
    searchParams.set(key, value)
  }
}

const normalizeInt = (value) => {
  const parsed = Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : null
}

export const normalizeHost = (value, fallback = 'telegram') => {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase()
  if (SUPPORTED_HOSTS.has(normalized)) return normalized
  return fallback
}

export const parseHostsCsv = (value, fallback = ['telegram', 'vk', 'max']) => {
  const chunks = String(value ?? '')
    .split(',')
    .map((item) => normalizeHost(item, ''))
    .filter((host) => SUPPORTED_HOSTS.has(host))
  const hosts = [...new Set(chunks)]
  if (hosts.length > 0) return hosts
  return [...new Set(fallback.map((item) => normalizeHost(item, 'telegram')))]
}

export const applyHostProfileDefaults = ({
  url,
  host = 'telegram',
  userId = '100001',
  width,
  height,
}) => {
  const targetHost = normalizeHost(host)
  const parsed = new URL(url)
  const { searchParams } = parsed
  const normalizedUserId = String(userId ?? '').trim() || '100001'
  const normalizedWidth = normalizeInt(width)
  const normalizedHeight = normalizeInt(height)

  if (targetHost === 'vk') {
    ensureParam(searchParams, 'tgEmu', '0')
    ensureParam(searchParams, 'vkEmu', '1')
    ensureParam(searchParams, 'vk_user_id', normalizedUserId)
    ensureParam(searchParams, 'vk_language', 'ru')
    ensureParam(searchParams, 'vk_platform', 'mobile_iphone')
    ensureParam(searchParams, 'vk_ref', 'direct')
    ensureParam(searchParams, 'vk_sign', 'dev-sign')
    ensureParam(searchParams, 'vkFixedTime', '09:41')
    ensureParam(searchParams, 'vkTopInset', '47')
    ensureParam(searchParams, 'vkBottomInset', '34')
    ensureParam(searchParams, 'vkLeftInset', '0')
    ensureParam(searchParams, 'vkRightInset', '0')
    ensureParam(searchParams, 'vkContentTopInset', '47')
    ensureParam(searchParams, 'vkContentBottomInset', '34')
    ensureParam(searchParams, 'vkContentLeftInset', '0')
    ensureParam(searchParams, 'vkContentRightInset', '0')
    if (normalizedWidth !== null) {
      ensureParam(searchParams, 'vkWidth', String(normalizedWidth))
    }
    if (normalizedHeight !== null) {
      ensureParam(searchParams, 'vkHeight', String(normalizedHeight))
    }
    return parsed.toString()
  }

  if (targetHost === 'max') {
    ensureParam(searchParams, 'tgEmu', '0')
    ensureParam(searchParams, 'vkEmu', '0')
    ensureParam(searchParams, 'maxEmu', '1')
    ensureParam(searchParams, 'maxUserId', normalizedUserId)
    ensureParam(searchParams, 'maxPlatform', 'ios')
    ensureParam(searchParams, 'WebAppPlatform', 'mobile_ios')
    ensureParam(searchParams, 'WebAppVersion', '1.0')
    ensureParam(searchParams, 'maxFixedTime', '09:41')
    ensureParam(searchParams, 'maxTopInset', '47')
    ensureParam(searchParams, 'maxBottomInset', '34')
    ensureParam(searchParams, 'maxLeftInset', '0')
    ensureParam(searchParams, 'maxRightInset', '0')
    ensureParam(searchParams, 'maxContentTopInset', '47')
    ensureParam(searchParams, 'maxContentBottomInset', '34')
    ensureParam(searchParams, 'maxContentLeftInset', '0')
    ensureParam(searchParams, 'maxContentRightInset', '0')
    if (normalizedWidth !== null) {
      ensureParam(searchParams, 'maxWidth', String(normalizedWidth))
    }
    if (normalizedHeight !== null) {
      ensureParam(searchParams, 'maxHeight', String(normalizedHeight))
    }
    return parsed.toString()
  }

  ensureParam(searchParams, 'vkEmu', '0')
  ensureParam(searchParams, 'tgEmu', '1')
  ensureParam(searchParams, 'tgUserId', normalizedUserId)
  ensureParam(searchParams, 'tgTheme', 'light')
  ensureParam(searchParams, 'tgPlatform', 'ios')
  ensureParam(searchParams, 'tgExpanded', '1')
  ensureParam(searchParams, 'tgFullscreen', '1')
  ensureParam(searchParams, 'tgFixedTime', '09:41')
  ensureParam(searchParams, 'tgTopInset', '47')
  ensureParam(searchParams, 'tgBottomInset', '34')
  ensureParam(searchParams, 'tgLeftInset', '0')
  ensureParam(searchParams, 'tgRightInset', '0')
  ensureParam(searchParams, 'tgContentTopInset', '47')
  ensureParam(searchParams, 'tgContentBottomInset', '34')
  ensureParam(searchParams, 'tgContentLeftInset', '0')
  ensureParam(searchParams, 'tgContentRightInset', '0')
  if (normalizedWidth !== null) {
    ensureParam(searchParams, 'tgWidth', String(normalizedWidth))
  }
  if (normalizedHeight !== null) {
    ensureParam(searchParams, 'tgHeight', String(normalizedHeight))
  }

  return parsed.toString()
}

export const buildHostProfileUrl = ({
  urlBase = 'http://127.0.0.1:5173/',
  host = 'telegram',
  userId = '100001',
  width,
  height,
}) =>
  applyHostProfileDefaults({
    url: urlBase,
    host,
    userId,
    width,
    height,
  })
