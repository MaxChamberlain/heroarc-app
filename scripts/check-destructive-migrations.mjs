#!/usr/bin/env node
// Guardrail for auto-merged PRs: fail if any SQL migration contains destructive
// statements unless that migration is listed in packages/db/destructive-allowlist.txt
// (a CODEOWNERS-protected file, so listing one requires a human review).
//
// Usage: node scripts/check-destructive-migrations.mjs
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const migrationsDir = join(root, 'packages/db/drizzle');
const allowlistPath = join(root, 'packages/db/destructive-allowlist.txt');

const DESTRUCTIVE = [
  { label: 'DROP TABLE', re: /\bDROP\s+TABLE\b/i },
  { label: 'DROP COLUMN', re: /\bDROP\s+COLUMN\b/i },
  { label: 'DROP TYPE', re: /\bDROP\s+TYPE\b/i },
  { label: 'DROP SCHEMA', re: /\bDROP\s+SCHEMA\b/i },
  { label: 'RENAME', re: /\bRENAME\s+(TO|COLUMN)\b/i },
  { label: 'column type change', re: /\bALTER\s+COLUMN\b[^;]*\b(SET\s+DATA\s+TYPE|TYPE)\b/i },
  { label: 'TRUNCATE', re: /\bTRUNCATE\b/i },
  { label: 'DELETE FROM', re: /\bDELETE\s+FROM\b/i },
];

const allowlist = new Set(
  readFileSync(allowlistPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#')),
);

let files = [];
try {
  files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
} catch {
  // No migrations folder yet: nothing to check.
}

const violations = [];
for (const file of files) {
  const sql = readFileSync(join(migrationsDir, file), 'utf8')
    // Ignore SQL comments so a comment like "-- we used to DROP COLUMN x" doesn't trip the check.
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const hits = DESTRUCTIVE.filter(({ re }) => re.test(sql)).map(({ label }) => label);
  if (hits.length > 0 && !allowlist.has(file)) {
    violations.push({ file, hits });
  }
}

if (violations.length > 0) {
  console.error(
    'Destructive migrations found that are not in packages/db/destructive-allowlist.txt:\n',
  );
  for (const { file, hits } of violations) {
    console.error(`  ${file}: ${hits.join(', ')}`);
  }
  console.error(
    '\nPrefer expand/contract (add new column → backfill → switch reads → remove later).' +
      '\nIf the destructive change is intended, add the filename to the allowlist; a human must approve it.',
  );
  process.exit(1);
}

console.log(`Checked ${files.length} migration(s): no unapproved destructive SQL.`);
