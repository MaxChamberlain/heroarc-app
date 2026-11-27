import 'reflect-metadata';
import { DEFAULT_LAYOUT } from '@heroarc/domain';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORPCModule } from '@orpc/nest';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUserService } from '../user/current-user.service.js';
import { LayoutController } from './layout.controller.js';
import { LayoutService } from './layout.service.js';

const layouts = { get: vi.fn(), save: vi.fn() };
const user = { userId: () => 'u1', timeZone: () => 'America/Denver' };
const APP = { 'x-heroarc': '1', 'content-type': 'application/json' };

describe('LayoutController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ORPCModule.forRoot({})],
      controllers: [LayoutController],
      providers: [
        { provide: LayoutService, useValue: layouts },
        { provide: CurrentUserService, useValue: user },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v1/layout returns the current user’s layout', async () => {
    layouts.get.mockResolvedValue(DEFAULT_LAYOUT);
    const res = await request(app.getHttpServer()).get('/api/v1/layout').expect(200);
    expect(layouts.get).toHaveBeenCalledWith('u1');
    expect(res.body.tiles).toHaveLength(DEFAULT_LAYOUT.tiles.length);
  });

  it('PUT /api/v1/layout saves a valid layout', async () => {
    layouts.save.mockImplementation(async (_u, l) => l);
    await request(app.getHttpServer())
      .put('/api/v1/layout')
      .set(APP)
      .send(DEFAULT_LAYOUT)
      .expect(200);
    expect(layouts.save).toHaveBeenCalledWith('u1', DEFAULT_LAYOUT);
  });

  it('rejects unknown cards, tiles off the grid, duplicates and missing app header', async () => {
    const bad = (tiles: unknown[]) => ({ version: 1, cols: 12, tiles });
    const tile = { id: 'health', x: 0, y: 0, w: 4, h: 8, hidden: false };
    await request(app.getHttpServer())
      .put('/api/v1/layout')
      .set(APP)
      .send(bad([{ ...tile, id: 'nope' }]))
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/layout')
      .set(APP)
      .send(bad([{ ...tile, x: 10 }]))
      .expect(400);
    await request(app.getHttpServer())
      .put('/api/v1/layout')
      .set(APP)
      .send(bad([tile, tile]))
      .expect(400);
    await request(app.getHttpServer()).put('/api/v1/layout').send(DEFAULT_LAYOUT).expect(403);
    expect(layouts.save).not.toHaveBeenCalled();
  });
});
