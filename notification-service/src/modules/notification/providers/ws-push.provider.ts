import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { io, Socket } from 'socket.io-client';
import { ChannelProvider, NotificationData } from '../interfaces/channel-provider.interface';
import { CustomLogger } from '../../../common/logger.service';

@Injectable()
export class WsPushProvider implements ChannelProvider {
  private socket: Socket;
  constructor(
    private configService: ConfigService,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {
    const wsUrl = this.configService.get<string>('WS_URL') ?? 'http://localhost:3000';
    this.socket = io(wsUrl);
    this.socket.on('connect', () => {
      this.logger.log('Connected to WebSocket server for push');
    });
  }

  async send(data: NotificationData): Promise<void> {
    this.socket.emit('notification', {
      type: data.type,
      title: data.title,
      message: data.message,
      recipientId: data.recipient,
      extra: data.extra,
    });
    this.logger.log(`Push sent to ${data.recipient}: ${data.title}`);
  }

  getType(): string {
    return 'ws-push';
  }
}

