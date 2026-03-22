import { Injectable, Inject } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { ConfigService } from '@nestjs/config';
import { ChannelProvider, NotificationData } from '../interfaces/channel-provider.interface';
import { CustomLogger } from '../../../common/logger.service';

@Injectable()
export class EmailProvider implements ChannelProvider {
  private transporter: nodemailer.Transporter;
  constructor(
    private configService: ConfigService,
    @Inject('CustomLogger') private logger: CustomLogger,
  ) {
    this.transporter = nodemailer.createTransport({
      host: this.configService.get('SMTP_HOST'),
      port: this.configService.get('SMTP_PORT', 587),
      secure: false,
      auth: {
        user: this.configService.get('SMTP_USER'),
        pass: this.configService.get('SMTP_PASS'),
      },
    });
  }

  async send(data: NotificationData): Promise<void> {
    const mailOptions = {
      from: this.configService.get('SMTP_FROM') || '"Coffee Shop" <noreply@coffeeshop.com>',
      to: data.recipient,
      subject: data.title,
      html: `
        <h1>${data.title}</h1>
        <p>${data.message}</p>
        <pre>${JSON.stringify(data.extra, null, 2)}</pre>
      `,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(`Email sent to ${data.recipient}: ${data.title}`);
    } catch (error) {
      this.logger.error(`Email failed: ${error}`);
      throw error;
    }
  }

  getType(): string {
    return 'email';
  }
}

