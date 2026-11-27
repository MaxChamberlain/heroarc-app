import { defineConfig } from 'drizzle-kit';

// `drizzle-kit generate` only diffs src/schema against drizzle/ — it never touches a database.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  casing: 'snake_case',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://heroarc:heroarc@localhost:5432/heroarc',
  },
});
