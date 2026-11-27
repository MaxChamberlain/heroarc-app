import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from './client.js';

// Applies every pending migration in packages/db/drizzle. Runs as Render's preDeployCommand.
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
const { db, close } = createDb(url, { max: 1 });
try {
  await migrate(db, { migrationsFolder });
  console.log('Migrations applied.');
} finally {
  await close();
}
