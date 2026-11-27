import { randomBytes } from 'node:crypto';
import { createDb } from './client.js';
import { invites } from './schema/index.js';

/*
 * Create an invite link (sign-up is invite-only). Use it for the first admin:
 *
 *   pnpm user:invite -- --admin [--email you@example.com]
 *
 * Admins can then invite people from Settings → People.
 */
const args = process.argv.slice(2);
const admin = args.includes('--admin');
const emailAt = args.indexOf('--email');
const email = emailAt >= 0 ? args[emailAt + 1]?.toLowerCase() : undefined;
const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const appUrl = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');

const { db, close } = createDb(url, { max: 1 });
try {
  const code = randomBytes(12).toString('base64url');
  await db.insert(invites).values({
    code,
    email: email ?? null,
    role: admin ? 'admin' : 'member',
    createdBy: 'system',
    expiresAt: new Date(Date.now() + 14 * 864e5),
  });
  console.log(
    `${admin ? 'Admin' : 'Member'} invite${email ? ` for ${email}` : ''} (valid 14 days):\n${appUrl}/invite/${code}`,
  );
} finally {
  await close();
}
