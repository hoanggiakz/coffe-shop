import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupSwagger(app: NestExpressApplication, configService: ConfigService): void {
  const config = new DocumentBuilder()
    .setTitle('Inventory Service')
    .setDescription('Coffee Shop Inventory Management APIs')
    .setVersion('1.0.0')
    .addBearerAuth()
    .addServer(`http://localhost:${configService.get('PORT') || 3005}`)
    .build();

  const document = SwaggerModule.createDocument(app, config, {
    deepScanRoutes: true,
  });

  SwaggerModule.setup('api-docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
    },
  });
}
