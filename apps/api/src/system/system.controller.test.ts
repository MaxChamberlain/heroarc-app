import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORPCModule } from '@orpc/nest';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { HealthController } from '../health/health.controller.js';
import { DB, ENV, REDIS } from '../infra/tokens.js';
import { SystemController } from './system.controller.js';

const fakeDb = { db: { execute: vi.fn() }, close: vi.fn() };
const fakeRedis = { ping: vi.fn() };

describe('health endpoints', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ORPCModule.forRoot({})],
      controllers: [HealthController, SystemController],
      providers: [
        { provide: ENV, useValue: { version: 'test' } },
        { provide: DB, useValue: fakeDb },
        { provide: REDIS, useValue: fakeRedis },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    fakeDb.db.execute.mockResolvedValue({ rows: [{ '?column?': 1 }] });
    fakeRedis.ping.mockResolvedValue('PONG');
  });

  it('GET /health is a dependency-free liveness probe', async () => {
    fakeDb.db.execute.mockRejectedValue(new Error('db down'));
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('GET /api/v1/system/health reports ok when db and kv respond', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/system/health').expect(200);
    expect(res.body).toMatchObject({
      ok: true,
      service: 'heroarc-api',
      version: 'test',
      checks: { db: 'ok', kv: 'ok' },
    });
  });

  it('GET /api/v1/system/health flags a failing dependency', async () => {
    fakeRedis.ping.mockRejectedValue(new Error('kv down'));
    const res = await request(app.getHttpServer()).get('/api/v1/system/health').expect(200);
    expect(res.body).toMatchObject({ ok: false, checks: { db: 'ok', kv: 'fail' } });
  });
});
