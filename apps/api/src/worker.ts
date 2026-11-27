import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker/worker.module.js';

// Background worker entry (Render "worker" service): no HTTP server, just queues.
async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule);
  app.enableShutdownHooks();
  console.log('heroarc-worker started');
}

void bootstrap();
