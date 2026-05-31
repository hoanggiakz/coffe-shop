import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { Socket } from 'socket.io';

export type SocketUser = {
  userId: string;
  role: string;
  branchId: string;
};

@Injectable()
export class SocketAuthService {
  constructor(private readonly configService: ConfigService) {}

  verifyStaffFromSocket(socket: Socket): SocketUser | null {
    const token =
      String(socket.handshake.auth?.token || '').trim() ||
      String(socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    const secretRaw = String(this.configService.get<string>('JWT_SECRET') || '');
    const secret = Buffer.from(secretRaw, 'utf8');
    const key = secret.length >= 32 ? secret : Buffer.concat([secret, Buffer.alloc(32 - secret.length)]);

    try {
      const decoded = jwt.verify(token, key) as any;
      const userId = String(decoded?.sub || decoded?.userId || '').trim();
      const branchId = String(decoded?.branchId || '').trim();
      const role = String(decoded?.role || (Array.isArray(decoded?.roles) ? decoded.roles[0] : '') || '').toUpperCase();
      if (!userId || !role) return null;
      if (!branchId && role !== 'ADMIN') return null;
      return { userId, role, branchId };
    } catch {
      return null;
    }
  }
}

