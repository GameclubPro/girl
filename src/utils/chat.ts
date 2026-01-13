export const buildChatStreamUrl = (apiBase: string, userId: string) => {
  const normalizedBase = apiBase.trim().replace(/\/$/, '')
  const normalizedUserId = userId.trim()
  if (!normalizedBase || !normalizedUserId) return ''
  const wsBase = normalizedBase.replace(/^http/i, (match) =>
    match.toLowerCase() === 'https' ? 'wss' : 'ws'
  )
  return `${wsBase}/api/chats/stream?userId=${encodeURIComponent(
    normalizedUserId
  )}`
}
