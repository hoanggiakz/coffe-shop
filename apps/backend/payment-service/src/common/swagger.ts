import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export function setupSwagger(app: INestApplication, configService: ConfigService) {
  const config = new DocumentBuilder()
    .setTitle(configService.get('APP_NAME') || 'Payment Service')
    .setDescription('Production-ready Payment microservice with VNPay')
    .setVersion('1.0')
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });
  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
    customCssUrl:
      'https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css',
    customfavIcon: 'https://avatars.githubusercontent.com/u/11267261?s=48&v=4',
    customSiteTitle: 'Payment Service API',
  });
}
