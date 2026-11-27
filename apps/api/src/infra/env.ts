import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  /** Where outside agents reach the API (https://api.<domain>); shown in Settings → Connections. */
  API_URL: z.string().url().default('http://localhost:4000'),
  /** Where people use the app (the web origin); sign-in links and cookies are for this origin. */
  APP_URL: z.string().url().default('http://localhost:3000'),
  /** Signs sessions and tokens. Required in production (32+ random characters). */
  // Empty (as .env.example ships it) means unset: dev uses a fallback, production refuses.
  BETTER_AUTH_SECRET: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
    z.string().min(32, 'must be at least 32 characters (openssl rand -base64 32)').optional(),
  ),
  /** Email: Resend in production; otherwise SMTP (Mailpit locally). */
  RESEND_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  SMTP_URL: z.string().default('smtp://localhost:1025'),
  MAIL_FROM: z.string().default('HeroArc <hello@heroarc.local>'),
  /** Google sign-in (optional): an OAuth client from Google Cloud. */
  GOOGLE_CLIENT_ID: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  GOOGLE_CLIENT_SECRET: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /** Coach (the in-app assistant). Without a key Coach says it isn't set up. */
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  /** Model for Coach; 'fake' is a scripted stand-in for tests (no API calls). */
  COACH_MODEL: z.string().default('claude-opus-5-5'),
  /** Voice notes are transcribed with OpenAI. Without a key, voice notes are turned off. */
  OPENAI_API_KEY: z
    .string()
    .optional()
    .transform((v) => v?.trim() || undefined),
  OPENAI_TRANSCRIBE_MODEL: z.string().default('gpt-transcribe'),
  /** Optional explicit version label; on Render the git commit is used. */
  APP_VERSION: z.string().optional(),
  RENDER_GIT_COMMIT: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema> & { version: string };

/** Parses and validates process.env once at startup. Fails fast with a readable message. */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment:\n${z.prettifyError(parsed.error)}`);
  }
  const data = parsed.data;
  return {
    ...data,
    version: data.APP_VERSION ?? data.RENDER_GIT_COMMIT?.slice(0, 7) ?? 'dev',
  };
}

/**
 * What the API (not the worker) needs in production: the secret that signs sessions and
 * encrypts token-signing keys. Without it the API would use the dev-only fallback.
 */
export function assertApiEnv(env: Env): void {
  if (env.NODE_ENV === 'production' && !env.BETTER_AUTH_SECRET)
    throw new Error('Invalid environment: BETTER_AUTH_SECRET is required in production.');
}
