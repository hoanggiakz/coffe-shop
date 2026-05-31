import { Injectable } from '@nestjs/common';
import { Server } from 'socket.io';

@Injectable()
export class NotificationHubService {
  private readonly servers = new Map<string, Server>();

  register(namespace: string, server: Server) {
    this.servers.set(namespace, server);
  }

  emitToRooms(namespace: string, event: string, rooms: string[], payload: any) {
    const server = this.servers.get(namespace);
    if (!server) return;
    for (const room of rooms) {
      server.to(room).emit(event, payload);
    }
  }

  emitToNamespace(namespace: string, event: string, payload: any) {
    const server = this.servers.get(namespace);
    if (!server) return;
    server.emit(event, payload);
  }
}

