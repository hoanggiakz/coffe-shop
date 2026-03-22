import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Observable } from 'rxjs';
import { SERVICE_ROUTES } from './interfaces/service-route.interface';

@Injectable()
export class ProxyGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();
    const path = request.route.path;
    const user = request.user;

    const route = SERVICE_ROUTES.find(r => request.url.startsWith(r.path));
    if (!route) return false;

    if (!route.public && !user) {
      throw new ForbiddenException('Authentication required');
    }

    if (route.roles && user && !route.roles.some(role => user.roles?.includes(role))) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}

