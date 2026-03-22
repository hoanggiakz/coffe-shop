import { io, Socket } from 'socket.io-client'

const WS_URL = import.meta.env.VITE_WS_URL || window.location.origin

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${WS_URL}/chat`, {
      transports: ['websocket'],
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
