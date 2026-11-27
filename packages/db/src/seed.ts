import { hashPassword } from 'better-auth/crypto';
import { eq } from 'drizzle-orm';
import { createDb } from './client.js';
import {
  account,
  dailyMetrics,
  habitChecks,
  habits,
  meals,
  moodEntries,
  type PlanWorkout,
  trainingPlans,
  trainingSessions,
  user,
  userGoals,
  userProfiles,
  weightEntries,
} from './schema/index.js';

/*
 * Seeds ~60 days of realistic, entirely synthetic data for the development user, so the
 * app has something to show before Oura and real logging are connected.
 *
 *   pnpm db:seed            (uses DEV_USER_ID, default "demo", and APP_TIMEZONE; creates the demo
 *                            account from DEMO_EMAIL / DEMO_USERNAME / DEMO_PASSWORD)
 *
 * Re-running replaces that user's data. Deterministic: same output for the same "today".
 */

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}
const userId = process.env.DEV_USER_ID || 'demo';
const timeZone = process.env.APP_TIMEZONE || 'America/Denver';
const DAYS = 60;

// ---------- deterministic randomness ----------
let seed = 20261125;
function rand(): number {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const int = (lo: number, hi: number) => Math.round(between(lo, hi));
const chance = (p: number) => rand() < p;
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- dates in the user's timezone ----------
function localDate(instant: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
function shiftDate(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/** The UTC instant for wall-clock time hh:mm on `day` in the user's timezone. */
/** `t`, or an hour ago if `t` is still to come (rows seeded for today). */
function beforeNow(t: Date): Date {
  return t.getTime() < now.getTime() ? t : new Date(now.getTime() - 60 * 60_000);
}

function at(day: string, hh: number, mm: number): Date {
  const probe = new Date(`${day}T12:00:00Z`);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(probe);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  // How far the zone's wall clock is ahead of UTC at that moment (e.g. −7 h for MST).
  const offsetMs =
    Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute')) -
    probe.getTime();
  const wall = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    hh,
    mm,
  );
  return new Date(wall - offsetMs);
}

const now = new Date();
const today = localDate(now);
const nowLocalHour = Number(
  new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' }).format(now),
);
const days = Array.from({ length: DAYS }, (_, i) => shiftDate(today, i - (DAYS - 1)));

// ---------- the demo person ----------
const goals = {
  userId,
  kcal: 2100,
  proteinG: 120,
  steps: 10000,
  activeKcal: 500,
  goalsSet: true,
  sex: 'female',
  age: 32,
  heightIn: 65,
  weightLb: 137,
  activity: 'moderate',
  goal: 'maintain',
};

const plan: PlanWorkout[] = [
  {
    name: 'Upper',
    ex: [
      { n: 'Bench Press', sets: '3 x 5', star: 1 },
      { n: 'Overhead Press', sets: '3 x 8', star: 0 },
      { n: 'Barbell Row', sets: '3 x 10', star: 0 },
    ],
  },
  {
    name: 'Lower',
    ex: [
      { n: 'Back Squat', sets: '3 x 5', star: 1 },
      { n: 'Romanian Deadlift', sets: '3 x 8', star: 1 },
      { n: 'Walking Lunge', sets: '3 x 12', star: 0 },
    ],
  },
  {
    name: 'Full Body',
    ex: [
      { n: 'Deadlift', sets: '1 x 5', star: 1 },
      { n: 'Pull-up', sets: '3 x 8', star: 0 },
      { n: 'Push-up', sets: '3 x 15', star: 0 },
    ],
  },
];

const habitList = [
  { id: 'stretch', name: 'Stretch 10 min', p: 0.75 },
  { id: 'read', name: 'Read 20 min', p: 0.6 },
  { id: 'water', name: '8 glasses of water', p: 0.8 },
  { id: 'no-screens', name: 'No screens after 10', p: 0.45 },
];

type MealIdea = readonly [items: string, kcal: number, protein: number, carbs: number, fat: number];
const MEALS: Record<'Breakfast' | 'Lunch' | 'Dinner' | 'Snack', readonly MealIdea[]> = {
  Breakfast: [
    ['Greek yogurt, berries, granola', 380, 28, 48, 8],
    ['Eggs, toast, avocado', 450, 24, 32, 24],
    ['Oatmeal, banana, peanut butter', 480, 16, 70, 15],
    ['Protein smoothie', 320, 35, 30, 6],
  ],
  Lunch: [
    ['Chicken rice bowl', 640, 48, 70, 14],
    ['Turkey sandwich, apple', 520, 34, 62, 12],
    ['Salmon salad', 560, 38, 22, 32],
    ['Burrito bowl', 720, 40, 82, 22],
  ],
  Dinner: [
    ['Steak, potatoes, green beans', 760, 52, 55, 32],
    ['Pasta with meat sauce', 820, 42, 98, 24],
    ['Stir-fry tofu, rice', 640, 30, 80, 20],
    ['Chicken thighs, quinoa, broccoli', 690, 50, 52, 26],
  ],
  Snack: [
    ['Protein bar', 220, 20, 24, 8],
    ['Apple, almonds', 260, 7, 26, 15],
    ['Cottage cheese', 180, 24, 8, 5],
  ],
};

// ---------- generate ----------
const metricRows: (typeof dailyMetrics.$inferInsert)[] = [];
const weightRows: (typeof weightEntries.$inferInsert)[] = [];
const mealRows: (typeof meals.$inferInsert)[] = [];
const checkRows: (typeof habitChecks.$inferInsert)[] = [];
const moodRows: (typeof moodEntries.$inferInsert)[] = [];
const sessionRows: (typeof trainingSessions.$inferInsert)[] = [];

let sleep = 76;
let weight = 138.8;
const lift: Record<string, number> = {
  'Bench Press': 85,
  'Back Squat': 115,
  'Romanian Deadlift': 105,
  Deadlift: 145,
};
let nextWorkout = 0;
let ev = 0;
const eventId = (p: string) => `seed-${p}-${(ev++).toString(36)}`;

for (const day of days) {
  const isToday = day === today;
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay();

  // Oura-like metrics. Today: last night's sleep is in, activity is partial.
  sleep = clamp(sleep + between(-6, 6) + (76 - sleep) * 0.25, 58, 94);
  const sleepScore = Math.round(sleep);
  const readiness = clamp(Math.round(sleepScore + between(-7, 9)), 55, 97);
  const dayShare = isToday ? clamp((nowLocalHour - 6) / 16, 0.1, 1) : 1;
  const steps = Math.round(int(4500, 13500) * dayShare);
  const activeKcal = Math.round(steps * between(0.065, 0.085));
  metricRows.push({
    userId,
    date: day,
    sleepScore,
    readiness,
    sleepHours: Math.round(between(5.8, 8.3) * 10) / 10,
    hrv: Math.round(between(78, 128)),
    rhr: Math.round(between(48, 57)),
    bedMin: chance(0.7) ? int(1365, 1439) : int(0, 45),
    wakeMin: int(390, 470),
    stressMin: int(20, 140),
    recoveryMin: int(60, 220),
    stressSummary: pick(['restored', 'normal', 'normal', 'stressful']),
    steps,
    activeKcal,
    totalKcal: Math.round(between(1860, 1950)) + activeKcal,
    updatedAt: isToday ? new Date(now.getTime() - 15 * 60_000) : at(day, 22, 0),
  });

  // Weigh-ins about 4 days a week, drifting slowly down.
  weight += between(-0.12, 0.06);
  if (chance(0.6) || isToday) {
    weightRows.push({
      userId,
      date: day,
      weightLb: Math.round((weight + between(-0.7, 0.7)) * 10) / 10,
      source: 'seed',
      eventId: eventId('w'),
      // Never later than now: the day's latest weigh-in is its weight, so a future one would
      // hide anything logged today (e.g. seeding just after midnight).
      createdAt: isToday ? beforeNow(at(day, 7, int(5, 40))) : at(day, 7, int(5, 40)),
    });
  }

  // Meals: most days fully logged; today only up to "now".
  if (!chance(0.08) || isToday) {
    const slots: [keyof typeof MEALS, number][] = [
      ['Breakfast', 8],
      ['Lunch', 12],
      ['Dinner', 18],
    ];
    if (chance(0.55)) slots.push(['Snack', 15]);
    for (const [meal, hour] of slots) {
      if (isToday && hour > nowLocalHour) continue;
      const [items, kcal, p, c, f] = pick(MEALS[meal]);
      const k = between(0.9, 1.15);
      mealRows.push({
        userId,
        date: day,
        time: `${String(hour).padStart(2, '0')}:${String(int(0, 50)).padStart(2, '0')}`,
        meal,
        items,
        kcal: Math.round(kcal * k),
        proteinG: Math.round(p * k),
        carbsG: Math.round(c * k),
        fatG: Math.round(f * k),
        confidence: pick(['Medium', 'High', 'Medium']),
        source: pick(['photo estimate', 'label', 'photo estimate']),
        createdBy: 'seed',
        eventId: eventId('m'),
        createdAt: at(day, hour, 30),
      });
    }
  }

  // Habits (only tracked for the last ~45 days).
  if (days.indexOf(day) >= DAYS - 45) {
    for (const h of habitList) {
      if (isToday && chance(0.5)) continue;
      checkRows.push({ userId, date: day, habitId: h.id, done: chance(h.p) });
    }
  }

  // Mood: about 60% of days, sometimes twice.
  if (chance(0.6) || isToday) {
    const n = chance(0.3) ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const hour = isToday ? Math.min(nowLocalHour, 9 + i * 6) : 9 + i * 8;
      const mood = clamp(Math.round(between(2.4, 5.2) + (sleepScore - 75) / 15), 1, 5);
      moodRows.push({
        userId,
        date: day,
        mood,
        note: chance(0.35)
          ? pick(['good workout', 'tired', 'busy day', 'great sleep', 'stressed about work'])
          : '',
        loggedAt: isToday ? beforeNow(at(day, hour, int(0, 55))) : at(day, hour, int(0, 55)),
        eventId: eventId('mood'),
      });
    }
  }

  // Training: Mon / Wed / Fri, plus a logged rest day on Sundays; not today.
  if (!isToday) {
    if ([1, 3, 5].includes(dow) && chance(0.85)) {
      const w = plan[nextWorkout % plan.length] as PlanWorkout;
      nextWorkout++;
      const lifts: Record<string, { dir: 'up' | 'same'; wt: number; reps: number }> = {};
      for (const x of w.ex.filter((e) => e.star === 1)) {
        const up = chance(0.5);
        if (up) lift[x.n] = (lift[x.n] ?? 50) + 5;
        lifts[x.n] = { dir: up ? 'up' : 'same', wt: lift[x.n] ?? 50, reps: int(5, 8) };
      }
      sessionRows.push({
        userId,
        date: day,
        workout: w.name,
        status: chance(0.85) ? 'done' : 'partial',
        lifts,
        loggedAt: at(day, 18, int(0, 50)),
        eventId: eventId('t'),
      });
    } else if (dow === 0 && chance(0.7)) {
      sessionRows.push({
        userId,
        date: day,
        workout: null,
        status: 'rest',
        lifts: {},
        loggedAt: at(day, 20, 0),
        eventId: eventId('t'),
      });
    }
  }
}

// ---------- write ----------
const { db, close } = createDb(url, { max: 1 });
try {
  await db.transaction(async (tx) => {
    for (const t of [
      dailyMetrics,
      weightEntries,
      meals,
      habitChecks,
      habits,
      moodEntries,
      trainingSessions,
      trainingPlans,
      userGoals,
    ]) {
      await tx.delete(t).where(eq(t.userId, userId));
    }
    await tx.insert(userGoals).values(goals);
    await tx.insert(trainingPlans).values({ userId, workouts: plan });
    await tx
      .insert(habits)
      .values(habitList.map((h, i) => ({ userId, id: h.id, name: h.name, position: i })));
    await tx.insert(dailyMetrics).values(metricRows);
    await tx.insert(weightEntries).values(weightRows);
    await tx.insert(meals).values(mealRows);
    await tx.insert(habitChecks).values(checkRows);
    await tx.insert(moodEntries).values(moodRows);
    await tx.insert(trainingSessions).values(sessionRows);

    // The demo account that owns this data (dev only): verified, admin, onboarded.
    const email = process.env.DEMO_EMAIL || 'demo@heroarc.local';
    const uname = process.env.DEMO_USERNAME || 'demo';
    const password = process.env.DEMO_PASSWORD || 'heroarc-demo-password';
    const now = new Date();
    await tx
      .insert(user)
      .values({
        id: userId,
        name: 'Demo',
        email,
        emailVerified: true,
        username: uname,
        displayUsername: uname,
      })
      .onConflictDoUpdate({
        target: user.id,
        set: {
          email,
          emailVerified: true,
          username: uname,
          displayUsername: uname,
          updatedAt: now,
        },
      });
    await tx.delete(account).where(eq(account.userId, userId));
    await tx.insert(account).values({
      id: `${userId}-credential`,
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(password),
      updatedAt: now,
    });
    await tx
      .insert(userProfiles)
      .values({ userId, role: 'admin', timezone: timeZone, onboarded: true })
      .onConflictDoUpdate({
        target: userProfiles.userId,
        set: { role: 'admin', timezone: timeZone, onboarded: true },
      });
  });
  console.log(
    `Seeded "${userId}" (sign in as ${process.env.DEMO_USERNAME || 'demo'}; ${timeZone}, today ${today}): ${metricRows.length} days, ${weightRows.length} weigh-ins, ${mealRows.length} meals, ${moodRows.length} moods, ${sessionRows.length} sessions.`,
  );
} finally {
  await close();
}
