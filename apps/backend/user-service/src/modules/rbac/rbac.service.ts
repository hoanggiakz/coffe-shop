import { Injectable } from '@nestjs/common';

@Injectable()
export class RBACService {
  // Hardcoded permissions for roles - can be DB driven later
  getPermissionsForRole(role: string): string[] {
    const permissions = {
      ADMIN: ['order:read', 'order:update', 'inventory:manage'],
      MANAGER: ['order:read', 'order:update'],
      STAFF: ['order:read'],
    };
    return permissions[role as keyof typeof permissions] || [];
  }
}

