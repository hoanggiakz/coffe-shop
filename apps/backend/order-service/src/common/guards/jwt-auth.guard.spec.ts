import { UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  const guard = new JwtAuthGuard();

  it('throws original error when err is provided', () => {
    const err = new Error('boom');
    expect(() => guard.handleRequest(err, null, null)).toThrow(err);
  });

  it('throws UnauthorizedException when user is missing', () => {
    expect(() => guard.handleRequest(null, null, null)).toThrow(UnauthorizedException);
  });

  it('returns user when authentication passes', () => {
    const user = { id: 'u1' };
    expect(guard.handleRequest(null, user, null)).toEqual(user);
  });
});
