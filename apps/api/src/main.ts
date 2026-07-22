import { ConsoleLogger, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AppValidationPipe } from './http/pipes/app-validation.pipe';
import { McpOAuthService } from './mcp/mcp-oauth.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new ConsoleLogger({ json: true }),
  });
  const config = app.get(ConfigService);
  app.use(app.get(McpOAuthService).router());
  app.setGlobalPrefix('api', {
    exclude: [{ path: 'mcp', method: RequestMethod.ALL }],
  });
  app.useGlobalPipes(new AppValidationPipe());
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Obsync API')
      .setDescription(
        'Accounts, Vaults, collaboration, storage, and sharing APIs.',
      )
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/openapi.json',
  });
  app.enableShutdownHooks();
  await app.listen(config.getOrThrow<number>('app.port'), '0.0.0.0');
}
void bootstrap();
