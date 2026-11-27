import { Module } from '@nestjs/common';
import { AgentModule } from '../agent/agent.module.js';
import type { Env } from '../infra/env.js';
import { ENV } from '../infra/tokens.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { CoachController } from './coach.controller.js';
import { COACH_MODEL, CoachService, TRANSCRIBER } from './coach.service.js';
import { FakeCoachModel } from './fake-model.js';
import { ClaudeCoachModel } from './model.js';
import { FakeTranscriber, OpenAITranscriber } from './transcriber.js';

@Module({
  imports: [AgentModule],
  controllers: [CoachController],
  providers: [
    CoachService,
    CurrentUserService,
    {
      // Claude when there's a key; the scripted stand-in when COACH_MODEL=fake; otherwise off.
      provide: COACH_MODEL,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.COACH_MODEL === 'fake'
          ? new FakeCoachModel()
          : env.ANTHROPIC_API_KEY
            ? new ClaudeCoachModel(env.ANTHROPIC_API_KEY, env.COACH_MODEL)
            : null,
    },
    {
      provide: TRANSCRIBER,
      inject: [ENV],
      // COACH_MODEL=fake (tests) never calls a real service, even with a key in .env.
      useFactory: (env: Env) =>
        env.COACH_MODEL === 'fake'
          ? new FakeTranscriber()
          : env.OPENAI_API_KEY
            ? new OpenAITranscriber(env.OPENAI_API_KEY, env.OPENAI_TRANSCRIBE_MODEL)
            : null,
    },
  ],
})
export class CoachModule {}
