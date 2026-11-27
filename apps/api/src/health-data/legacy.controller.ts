import { contract } from '@heroarc/contracts';
import { Controller, UseGuards } from '@nestjs/common';
import { Implement, implement } from '@orpc/nest';
import { HeroarcClientGuard } from '../common/heroarc-client.guard.js';
import { CurrentUserService } from '../user/current-user.service.js';
import { HealthDataService } from './health-data.service.js';

const OK = { ok: true } as const;

/**
 * The original page's API (`contract.legacy`), backed by Postgres instead of a Google
 * Sheet + KV queue. Writes land immediately, so the snapshot's `pending` lists are empty.
 */
@Controller()
@UseGuards(HeroarcClientGuard)
export class LegacyController {
  constructor(
    private readonly data: HealthDataService,
    private readonly user: CurrentUserService,
  ) {}

  @Implement(contract.legacy.data)
  snapshot() {
    return implement(contract.legacy.data).handler(() =>
      this.data.snapshot(this.user.userId(), this.user.timeZone()),
    );
  }

  @Implement(contract.legacy.weight)
  weight() {
    return implement(contract.legacy.weight).handler(async ({ input }) => {
      await this.data.logWeight(this.user.userId(), {
        eventId: input.id,
        date: input.d,
        weightLb: input.w,
      });
      return OK;
    });
  }

  @Implement(contract.legacy.mood)
  mood() {
    return implement(contract.legacy.mood).handler(async ({ input }) => {
      await this.data.logMood(this.user.userId(), {
        eventId: input.id,
        date: input.d,
        mood: input.m,
        note: input.n,
      });
      return OK;
    });
  }

  @Implement(contract.legacy.habits)
  habits() {
    return implement(contract.legacy.habits).handler(async ({ input }) => {
      await this.data.setHabitCheck(this.user.userId(), {
        date: input.d,
        habitId: input.h,
        done: input.v === 1,
      });
      return OK;
    });
  }

  @Implement(contract.legacy.habitConfig)
  habitConfig() {
    return implement(contract.legacy.habitConfig).handler(async ({ input }) => {
      await this.data.setHabitConfig(this.user.userId(), { list: input.list });
      return OK;
    });
  }

  @Implement(contract.legacy.goals)
  goals() {
    return implement(contract.legacy.goals).handler(async ({ input }) => {
      await this.data.setGoals(this.user.userId(), input);
      return OK;
    });
  }

  @Implement(contract.legacy.plan)
  plan() {
    return implement(contract.legacy.plan).handler(async ({ input }) => {
      await this.data.setPlan(this.user.userId(), input);
      return OK;
    });
  }

  @Implement(contract.legacy.training)
  training() {
    return implement(contract.legacy.training).handler(async ({ input }) => {
      await this.data.logTraining(this.user.userId(), {
        eventId: input.id,
        date: input.d,
        status: input.s,
        workout: input.w,
        lifts: input.lifts,
      });
      return OK;
    });
  }

  /** Oura isn't connected yet (Phase 3). `ok: false` makes the page say sync isn't available. */
  @Implement(contract.legacy.syncRequest)
  syncRequest() {
    return implement(contract.legacy.syncRequest).handler(() => ({ ok: false }));
  }
}
