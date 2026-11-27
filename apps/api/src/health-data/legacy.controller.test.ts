import 'reflect-metadata';
import { buildSnapshot } from '@heroarc/domain';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORPCModule } from '@orpc/nest';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CurrentUserService } from '../user/current-user.service.js';
import { HealthDataService } from './health-data.service.js';
import { LegacyController } from './legacy.controller.js';

const data = {
  snapshot: vi.fn(),
  logWeight: vi.fn(),
  logMood: vi.fn(),
  setHabitCheck: vi.fn(),
  setHabitConfig: vi.fn(),
  setGoals: vi.fn(),
  setPlan: vi.fn(),
  logTraining: vi.fn(),
};
const user = { userId: () => 'u1', timeZone: () => 'America/Denver' };
const APP = { 'x-heroarc': '1', 'content-type': 'application/json' };

describe('LegacyController (the original page API)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ORPCModule.forRoot({})],
      controllers: [LegacyController],
      providers: [
        { provide: HealthDataService, useValue: data },
        { provide: CurrentUserService, useValue: user },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET /api/data returns the snapshot for the current user', async () => {
    data.snapshot.mockResolvedValue(
      buildSnapshot({
        now: new Date('2026-11-26T02:30:00Z'),
        timeZone: 'America/Denver',
        goals: null,
        metrics: [],
        weights: [],
        meals: [],
        habits: [],
        habitChecks: [],
        moods: [],
        plan: null,
        sessions: [],
      }),
    );
    const res = await request(app.getHttpServer()).get('/api/data?1795662632578').expect(200);
    expect(data.snapshot).toHaveBeenCalledWith('u1', 'America/Denver');
    expect(res.body).toMatchObject({ date: '2026-11-25', goals: { kcal: 2200 } });
  });

  it('POST /api/weight logs the weigh-in', async () => {
    await request(app.getHttpServer())
      .post('/api/weight')
      .set(APP)
      .send({ id: 'w1abc', d: '2026-11-25', w: 136.6 })
      .expect(200, { ok: true });
    expect(data.logWeight).toHaveBeenCalledWith('u1', {
      eventId: 'w1abc',
      date: '2026-11-25',
      weightLb: 136.6,
    });
  });

  it('rejects invalid input with 400 and writes nothing', async () => {
    await request(app.getHttpServer())
      .post('/api/weight')
      .set(APP)
      .send({ id: 'w1abc', d: '2026-11-25', w: 12 })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/habit-config')
      .set(APP)
      .send({
        id: 'cfg1',
        list: Array.from({ length: 9 }, (_, i) => ({ id: `h${i}`, n: `Habit ${i}` })),
      })
      .expect(400);
    expect(data.logWeight).not.toHaveBeenCalled();
    expect(data.setHabitConfig).not.toHaveBeenCalled();
  });

  it('refuses writes without the app header', async () => {
    await request(app.getHttpServer())
      .post('/api/mood')
      .send({ id: 'm1abc', d: '2026-11-25', m: 4 })
      .expect(403);
    expect(data.logMood).not.toHaveBeenCalled();
  });

  it('saves goals with or without fat and carbs (the original page sends neither)', async () => {
    const base = {
      id: 'g1abc',
      sex: 'female',
      age: 30,
      height: 65,
      weight: 135,
      activity: 'light',
      goal: 'maintain',
      kcal: 1830,
      protein: 101,
    };
    await request(app.getHttpServer()).post('/api/goals').set(APP).send(base).expect(200);
    expect(data.setGoals).toHaveBeenLastCalledWith(
      'u1',
      expect.not.objectContaining({ fat: expect.anything() }),
    );

    await request(app.getHttpServer())
      .post('/api/goals')
      .set(APP)
      .send({ ...base, carbs: 220, fat: 60, trackMacros: true })
      .expect(200);
    expect(data.setGoals).toHaveBeenLastCalledWith(
      'u1',
      expect.objectContaining({ carbs: 220, fat: 60, trackMacros: true }),
    );

    await request(app.getHttpServer())
      .post('/api/goals')
      .set(APP)
      .send({ ...base, fat: 5000 })
      .expect(400);
  });

  it('maps training, mood and habit events to the service', async () => {
    await request(app.getHttpServer())
      .post('/api/training')
      .set(APP)
      .send({
        id: 't1abc',
        d: '2026-11-24',
        s: 'done',
        w: 'Upper',
        lifts: { Bench: { wt: 95, reps: 5 } },
      })
      .expect(200);
    expect(data.logTraining).toHaveBeenCalledWith('u1', {
      eventId: 't1abc',
      date: '2026-11-24',
      status: 'done',
      workout: 'Upper',
      lifts: { Bench: { wt: 95, reps: 5 } },
    });

    await request(app.getHttpServer())
      .post('/api/mood')
      .set(APP)
      .send({ id: 'm1abc', d: '2026-11-25', m: 4, n: 'good day' })
      .expect(200);
    expect(data.logMood).toHaveBeenCalledWith('u1', {
      eventId: 'm1abc',
      date: '2026-11-25',
      mood: 4,
      note: 'good day',
    });

    await request(app.getHttpServer())
      .post('/api/habits')
      .set(APP)
      .send({ id: 'h1abc', d: '2026-11-25', h: 'stretch', v: 1 })
      .expect(200);
    expect(data.setHabitCheck).toHaveBeenCalledWith('u1', {
      date: '2026-11-25',
      habitId: 'stretch',
      done: true,
    });
  });

  it('answers sync-request with ok: false until Oura is connected', async () => {
    await request(app.getHttpServer())
      .post('/api/sync-request')
      .set(APP)
      .send({ id: 's1abc' })
      .expect(200, { ok: false });
  });
});
