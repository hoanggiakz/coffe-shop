import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

type VerifiedUser = {
  sub: string;
  email?: string;
  roles: string[];
  branchId?: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);
    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const internalToken = String(this.configService.get('INTERNAL_SERVICE_TOKEN') || '').trim();
    if (internalToken && token === internalToken) {
      request.user = { sub: 'internal-service', roles: ['INTERNAL_SERVICE'] };
      return true;
    }

    request.user = this.verifyJwt(token);
    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  private verifyJwt(token: string): VerifiedUser {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new UnauthorizedException('Invalid JWT format');
    }

    const [encodedHeader, encodedPayload, signature] = parts;
    const expectedSignature = createHmac('sha256', this.getSecretKey())
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest('base64url');

    const received = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
      throw new UnauthorizedException('Invalid JWT signature');
    }

    const payload = JSON.parse(Buffer.from(this.decodeBase64Url(encodedPayload), 'utf8').toString('utf8')) as {
      sub?: string;
      email?: string;
      role?: string;
      roles?: string[];
      branchId?: string;
      branch_id?: string;
      exp?: number;
    };

    if (!payload?.sub) {
      throw new UnauthorizedException('Invalid JWT payload');
    }
    if (payload.exp && Date.now() >= payload.exp * 1000) {
      throw new UnauthorizedException('JWT expired');
    }

    const roles = Array.isArray(payload.roles)
      ? payload.roles
      : payload.role
        ? [payload.role]
        : [];

    return {
      sub: String(payload.sub),
      email: payload.email ? String(payload.email) : undefined,
      roles: roles.map((role) => String(role).toUpperCase()),
      branchId: String(payload.branchId || payload.branch_id || '').trim() || undefined,
    };
  }

  private getSecretKey(): Buffer {
    const rawSecret = String(this.configService.get('JWT_SECRET') || '').trim();
    if (!rawSecret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }
    const key = Buffer.from(rawSecret, 'utf8');
    if (key.length >= 32) {
      return key;
    }
    const padded = Buffer.alloc(32);
    key.copy(padded);
    return padded;
  }

  private decodeBase64Url(value: string): string {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
    return Buffer.from(`${normalized}${padding}`, 'base64').toString('utf8');
  }
}
