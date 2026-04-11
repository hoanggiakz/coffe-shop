import { io, Socket } from 'socket.io-client'
import { resolveWebsocketBaseUrl } from '@/utils/runtime-endpoints'

const WS_URL = resolveWebsocketBaseUrl()

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/chat`, {
      transports: ['websocket', 'polling'],
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
