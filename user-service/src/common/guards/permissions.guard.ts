import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

const rolePermissions = {
  ADMIN: ['order:read', 'order:update', 'inventory:manage'],
  MANAGER: ['order:read', 'order:update'],
  STAFF: ['order:read'],
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const userPermissions = rolePermissions[user.role as keyof typeof rolePermissions];
    return requiredPermissions.some((permission) =>
      userPermissions.includes(permission),
    );
  }
}
