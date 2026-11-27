import { accountContract } from './account.js';
import { activityContract } from './activity.js';
import { agentContract } from './agent.js';
import { coachContract } from './coach.js';
import { connectionsContract } from './connections.js';
import { importContract } from './import.js';
import { layoutContract } from './layout.js';
import { legacyContract } from './legacy.js';
import { ouraContract } from './oura.js';
import { systemContract } from './system.js';

export * from './account.js';
export * from './activity.js';
export * from './agent.js';
export * from './coach.js';
export * from './connections.js';
export * from './import.js';
export * from './layout.js';
export * from './legacy.js';
export * from './oura.js';
export * from './system.js';

/**
 * The HeroArc web API contract. Every route path is the full path the API serves
 * (the web app proxies `/api/*` to the API unchanged).
 *
 * To add an endpoint: add a schema + route here, implement it in apps/api with
 * `@Implement(contract.<group>.<name>)`, then call it from apps/web via `orpc`.
 * See .agents/skills/add-api-endpoint/SKILL.md.
 */
export const contract = {
  system: systemContract,
  /** Compatibility routes for the original page (see legacy.ts). */
  legacy: legacyContract,
  /** Dashboard board layout (see layout.ts). */
  layout: layoutContract,
  /** Coach, the in-app assistant (see coach.ts). */
  coach: coachContract,
  /** The signed-in user, sign-in options, invites (see account.ts). */
  account: accountContract,
  /** API keys for outside agents (see connections.ts). */
  connections: connectionsContract,
  /** The agent API: outside agents call tools with an API key (see agent.ts). */
  agent: agentContract,
  /** What outside agents did or proposed, with Apply / Undo (see activity.ts). */
  activity: activityContract,
  /** Importing the original HeroArc's Google Sheet (see import.ts). */
  import: importContract,
  /** Connecting Oura and syncing its daily numbers (see oura.ts). */
  oura: ouraContract,
};

export type Contract = typeof contract;
