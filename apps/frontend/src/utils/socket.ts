import { io, Socket } from 'socket.io-client'
import { resolveWebsocketBaseUrl } from '@/utils/runtime-endpoints'

const WS_URL = resolveWebsocketBaseUrl()

let socket: Socket | null = null

export function getSocket(): Socket {
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
    })
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}
