import { buildChatStreamUrl } from './chat'

export type ChatStreamStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'offline'

export type ChatStreamEvent = {
  type: string
  [key: string]: unknown
}

type Listener = (event: ChatStreamEvent) => void
type StatusListener = (status: ChatStreamStatus) => void

type ChatStreamClient = {
  subscribe: (listener: Listener) => () => void
  subscribeStatus: (listener: StatusListener) => () => void
  send: (payload: ChatStreamEvent) => boolean
  getStatus: () => ChatStreamStatus
}

type StreamState = {
  apiBase: string
  userId: string
  status: ChatStreamStatus
  socket: WebSocket | null
  reconnectAttempt: number
  reconnectTimer: number | null
  listeners: Set<Listener>
  statusListeners: Set<StatusListener>
  refCount: number
  idleTimer: number | null
}

const streams = new Map<string, StreamState>()

const buildKey = (apiBase: string, userId: string) =>
  `${apiBase.trim()}::${userId.trim()}`

const updateStatus = (state: StreamState, next: ChatStreamStatus) => {
  if (state.status === next) return
  state.status = next
  state.statusListeners.forEach((listener) => listener(next))
}

const scheduleReconnect = (state: StreamState) => {
  if (state.reconnectTimer !== null) return
  if (state.listeners.size === 0) {
    updateStatus(state, 'offline')
    return
  }
  updateStatus(state, 'reconnecting')
  const baseDelay = Math.min(12000, 600 * 2 ** state.reconnectAttempt)
  const jitter = Math.random() * 400
  const delay = baseDelay + jitter
  state.reconnectTimer = window.setTimeout(() => {
    state.reconnectTimer = null
    state.reconnectAttempt += 1
    connectStream(state)
  }, delay)
}

const connectStream = (state: StreamState) => {
  if (state.socket || state.listeners.size === 0) return
  const url = buildChatStreamUrl(state.apiBase, state.userId)
  if (!url) return
  updateStatus(state, state.reconnectAttempt > 0 ? 'reconnecting' : 'connecting')
  const socket = new WebSocket(url)
  state.socket = socket

  socket.onopen = () => {
    state.reconnectAttempt = 0
    updateStatus(state, 'connected')
  }

  socket.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as ChatStreamEvent
      state.listeners.forEach((listener) => listener(payload))
    } catch (error) {
      console.error('Chat stream payload failed:', error)
    }
  }

  socket.onerror = () => {
    if (state.socket === socket) {
      socket.close()
    }
  }

  socket.onclose = () => {
    if (state.socket === socket) {
      state.socket = null
    }
    scheduleReconnect(state)
  }
}

const ensureStreamState = (apiBase: string, userId: string) => {
  const key = buildKey(apiBase, userId)
  const existing = streams.get(key)
  if (existing) return existing
  const next: StreamState = {
    apiBase,
    userId,
    status: 'idle',
    socket: null,
    reconnectAttempt: 0,
    reconnectTimer: null,
    listeners: new Set(),
    statusListeners: new Set(),
    refCount: 0,
    idleTimer: null,
  }
  streams.set(key, next)
  return next
}

const scheduleIdleClose = (state: StreamState) => {
  if (state.idleTimer !== null) return
  state.idleTimer = window.setTimeout(() => {
    state.idleTimer = null
    if (state.listeners.size > 0 || state.statusListeners.size > 0) return
    if (state.socket) {
      state.socket.close()
      state.socket = null
    }
    updateStatus(state, 'offline')
  }, 12000)
}

export const getChatStream = (apiBase: string, userId: string): ChatStreamClient => {
  const state = ensureStreamState(apiBase, userId)

  const subscribe = (listener: Listener) => {
    state.listeners.add(listener)
    state.refCount += 1
    if (state.idleTimer !== null) {
      window.clearTimeout(state.idleTimer)
      state.idleTimer = null
    }
    if (!state.socket) {
      connectStream(state)
    }
    return () => {
      state.listeners.delete(listener)
      state.refCount = Math.max(0, state.refCount - 1)
      if (state.listeners.size === 0 && state.statusListeners.size === 0) {
        scheduleIdleClose(state)
      }
    }
  }

  const subscribeStatus = (listener: StatusListener) => {
    state.statusListeners.add(listener)
    listener(state.status)
    if (state.idleTimer !== null) {
      window.clearTimeout(state.idleTimer)
      state.idleTimer = null
    }
    if (!state.socket) {
      connectStream(state)
    }
    return () => {
      state.statusListeners.delete(listener)
      if (state.listeners.size === 0 && state.statusListeners.size === 0) {
        scheduleIdleClose(state)
      }
    }
  }

  const send = (payload: ChatStreamEvent) => {
    if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
      return false
    }
    state.socket.send(JSON.stringify(payload))
    return true
  }

  return {
    subscribe,
    subscribeStatus,
    send,
    getStatus: () => state.status,
  }
}
