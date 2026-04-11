import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

@Injectable()
export class CustomConfigService {
  constructor(private readonly configService: NestConfigService) {}

  get<T = any>(key: string): T {
    return this.configService.get<T>(key);
  }
}
