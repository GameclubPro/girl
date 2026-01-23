import { buildAuthQuery } from './api'

export const buildChatStreamUrl = (apiBase: string, userId: string) => {
  const normalizedBase = apiBase.trim().replace(/\/$/, '')
  const normalizedUserId = userId.trim()
  if (!normalizedBase || !normalizedUserId) return ''
  const wsBase = normalizedBase.replace(/^http/i, (match) =>
    match.toLowerCase() === 'https' ? 'wss' : 'ws'
  )
  const authQuery = buildAuthQuery()
  const query = authQuery || `userId=${encodeURIComponent(normalizedUserId)}`
  return `${wsBase}/api/chats/stream?${query}`
}
