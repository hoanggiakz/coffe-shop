import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

export function setupSwagger(app: any, config: any) {
  const swaggerConfig = new DocumentBuilder()
    .setTitle(config.title)
    .setDescription(config.description)
    .setVersion(config.version)
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(config.path || 'api/docs', app, document);
}

