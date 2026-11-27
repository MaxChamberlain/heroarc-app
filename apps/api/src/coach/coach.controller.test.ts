import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ORPCModule } from '@orpc/nest';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionError, AgentService } from '../agent/agent.service.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { CoachController } from './coach.controller.js';
import { CoachService } from './coach.service.js';

const coach = {
  status: vi.fn(),
  send: vi.fn(),
  chats: vi.fn(),
  chat: vi.fn(),
  deleteChat: vi.fn(),
  attachment: vi.fn(),
  notes: vi.fn(),
  deleteNote: vi.fn(),
  note: vi.fn(),
};
const agent = { confirm: vi.fn(), cancel: vi.fn(), undo: vi.fn() };
const user = { userId: () => 'u1', timeZone: () => 'America/Denver' };
const APP = { 'x-heroarc': '1' };
const ID = '6b102e68-15ac-4632-959b-735b63a656b4';

describe('CoachController', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ORPCModule.forRoot({})],
      controllers: [CoachController],
      providers: [
        { provide: CoachService, useValue: coach },
        { provide: AgentService, useValue: agent },
        { provide: CurrentUserService, useValue: user },
      ],
    }).compile();
    app = moduleRef.createNestApplication({ bodyParser: false });
    await app.init();
  });
  afterAll(async () => app.close());
  beforeEach(() => vi.clearAllMocks());

  it('GET /api/v1/coach/status says whether Coach and voice are set up', async () => {
    coach.status.mockReturnValue({ enabled: false, voice: false, scripted: false });
    const res = await request(app.getHttpServer()).get('/api/v1/coach/status').expect(200);
    expect(res.body).toEqual({ enabled: false, voice: false, scripted: false });
  });

  it('streams the reply as server-sent events', async () => {
    coach.send.mockImplementation(async function* () {
      yield { type: 'text', delta: 'Hi' };
      yield {
        type: 'done',
        message: { id: 'm1', role: 'coach', text: 'Hi', at: '2026-11-27T00:00:00Z' },
      };
    });
    const res = await request(app.getHttpServer())
      .post('/api/v1/coach/send')
      .set({ ...APP, 'content-type': 'application/json' })
      .send({ text: 'hello' })
      .expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('"delta":"Hi"');
    expect(coach.send).toHaveBeenCalledWith(
      { userId: 'u1', timeZone: 'America/Denver', actor: 'coach' },
      expect.objectContaining({ text: 'hello' }),
      expect.anything(),
    );
  });

  it('Apply / Undo settle the action and leave Coach a note in its chat', async () => {
    const receipt = {
      actionId: ID,
      tool: 'log_weight',
      summary: 'Logged 150.0 lb (today)',
      status: 'undone',
    };
    agent.undo.mockResolvedValue({ receipt, changed: ['data'], chatId: 'c1' });
    const res = await request(app.getHttpServer())
      .post(`/api/v1/coach/actions/${ID}/undo`)
      .set(APP)
      .expect(200);
    expect(res.body).toEqual({ receipt, changed: ['data'] });
    expect(coach.note).toHaveBeenCalledWith('u1', 'c1', 'The user undid: Logged 150.0 lb (today)');
  });

  it('maps a missing action to 404 and a stale one to 409', async () => {
    agent.confirm.mockRejectedValueOnce(new ActionError('not_found'));
    await request(app.getHttpServer())
      .post(`/api/v1/coach/actions/${ID}/confirm`)
      .set(APP)
      .expect(404);
    agent.confirm.mockRejectedValueOnce(new ActionError('stale', 'No weight with that id.'));
    await request(app.getHttpServer())
      .post(`/api/v1/coach/actions/${ID}/confirm`)
      .set(APP)
      .expect(409);
  });

  it('refuses writes without the app header', async () => {
    await request(app.getHttpServer()).post(`/api/v1/coach/actions/${ID}/undo`).expect(403);
    expect(agent.undo).not.toHaveBeenCalled();
  });
});
