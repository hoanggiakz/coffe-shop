import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const rawSecret = configService.get<string>('JWT_SECRET') || '';
    const key = Buffer.from(rawSecret, 'utf8');
    const normalizedKey = key.length >= 32 ? key : (() => {
      const padded = Buffer.alloc(32);
      key.copy(padded);
      return padded;
    })();

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: normalizedKey,
    });
  }

  async validate(payload: any) {
    if (!payload) {
      throw new UnauthorizedException();
    }

    const roles = Array.isArray(payload.roles)
      ? payload.roles
      : payload.role
        ? [payload.role]
        : [];

    // Forward user info to request
    return { 
      userId: payload.sub, 
      email: payload.email, 
      roles,
      branchId: payload.branchId ?? null,
    };
  }
}

