import { io, Socket } from 'socket.io-client'
import { resolveWebsocketBaseUrl } from '@/utils/runtime-endpoints'

const WS_URL = resolveWebsocketBaseUrl()

let socket: Socket | null = null

function readSessionToken(): string {
  if (typeof window === 'undefined') return ''
  try {
    const raw = sessionStorage.getItem('auth-storage')
    if (!raw) return ''
    const parsed = JSON.parse(raw)
    const firstState = parsed?.state ?? parsed
    const secondState = firstState?.state ?? firstState
    const candidates = [firstState?.token, secondState?.token]
    for (const token of candidates) {
      const normalized = String(token || '').trim()
      if (normalized) return normalized
    }
    return ''
  } catch {
    return ''
  }
}

export function getSocket(): Socket {
  const token = readSessionToken()
  if (!socket) {
    socket = io(`${WS_URL}/chat`, {
      // Start with polling to avoid noisy websocket handshake warnings
      // when chat service is starting/restarting, then upgrade automatically.
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.4,
      timeout: 10000,
      autoConnect: false,
      auth: token ? { token } : undefined,
      query: token ? { access_token: token } : undefined,
    })
  } else {
    socket.auth = token ? { token } : {}
    socket.io.opts.query = token ? { access_token: token } : {}
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
