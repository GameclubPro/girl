export const buildChatStreamUrl = (apiBase: string, sessionToken: string) => {
  const normalizedBase = apiBase.trim().replace(/\/$/, '')
  const normalizedSessionToken = sessionToken.trim()
  if (!normalizedBase || !normalizedSessionToken) return ''
  const wsBase = normalizedBase.replace(/^http/i, (match) =>
    match.toLowerCase() === 'https' ? 'wss' : 'ws'
  )
  return `${wsBase}/api/chats/stream?sessionToken=${encodeURIComponent(
    normalizedSessionToken
  )}`
}
