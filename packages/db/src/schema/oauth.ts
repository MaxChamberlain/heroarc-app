import { boolean, index, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { session, user } from './auth.js';

/*
 * OAuth for MCP clients (Claude, ChatGPT and other connectors that sign in instead of using an
 * API key): Better Auth's JWT plugin (signing keys) and OAuth provider (`@better-auth/mcp`).
 * Field names follow Better Auth's models exactly (it reads and writes these through the
 * Drizzle adapter); only the table names are ours. Generated from the plugins' own table
 * definitions (better-auth/db getAuthTables) for Better Auth 1.7.28.
 */

const ts = () => timestamp({ withTimezone: true });

/** Signing keys for access and ID tokens (JWT plugin); private keys are encrypted. */
export const jwks = pgTable('jwks', {
  id: text().primaryKey(),
  publicKey: text().notNull(),
  privateKey: text().notNull(),
  createdAt: ts().notNull(),
  expiresAt: ts(),
  alg: text(),
  crv: text(),
});

/** Registered OAuth clients (dynamic registration or Client ID Metadata Documents). */
export const oauthClient = pgTable(
  'oauth_client',
  {
    id: text().primaryKey(),
    clientId: text().notNull().unique(),
    clientSecret: text(),
    clientDiscoveryId: text(),
    disabled: boolean().default(false),
    skipConsent: boolean(),
    enableEndSession: boolean(),
    subjectType: text(),
    scopes: text().array(),
    clientCredentialsScopes: text().array().default([]),
    userId: text().references(() => user.id, { onDelete: 'cascade' }),
    createdAt: ts(),
    updatedAt: ts(),
    name: text(),
    uri: text(),
    icon: text(),
    contacts: text().array(),
    tos: text(),
    policy: text(),
    softwareId: text(),
    softwareVersion: text(),
    softwareStatement: text(),
    redirectUris: text().array().notNull(),
    postLogoutRedirectUris: text().array(),
    backchannelLogoutUri: text(),
    backchannelLogoutSessionRequired: boolean(),
    tokenEndpointAuthMethod: text(),
    applicationType: text(),
    jwks: text(),
    jwksUri: text(),
    grantTypes: text().array(),
    responseTypes: text().array(),
    requirePKCE: boolean(),
    dpopBoundAccessTokens: boolean().default(false),
    referenceId: text(),
    metadata: jsonb(),
  },
  (t) => [index().on(t.userId)],
);

/** Protected resources tokens can be issued for (our MCP server). */
export const oauthResource = pgTable('oauth_resource', {
  id: text().primaryKey(),
  identifier: text().notNull().unique(),
  name: text().notNull(),
  accessTokenTtl: integer(),
  refreshTokenTtl: integer(),
  signingAlgorithm: text(),
  signingKeyId: text(),
  allowedScopes: text().array(),
  customClaims: jsonb(),
  dpopBoundAccessTokensRequired: boolean().default(false),
  disabled: boolean().default(false),
  createdAt: ts(),
  updatedAt: ts(),
  policyVersion: integer().default(1),
  metadata: jsonb(),
});

export const oauthClientResource = pgTable(
  'oauth_client_resource',
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    resourceId: text()
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: 'cascade' }),
    metadata: jsonb(),
    createdAt: ts(),
  },
  (t) => [index().on(t.clientId), index().on(t.resourceId)],
);

export const oauthRefreshToken = pgTable(
  'oauth_refresh_token',
  {
    id: text().primaryKey(),
    token: text().notNull().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text().references(() => session.id, { onDelete: 'set null' }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    expiresAt: ts(),
    createdAt: ts(),
    revoked: ts(),
    rotatedAt: ts(),
    rotationReplayResponse: text(),
    rotationReplayExpiresAt: ts(),
    authTime: ts(),
    confirmation: jsonb(),
    scopes: text().array().notNull(),
  },
  (t) => [
    index().on(t.clientId),
    index().on(t.sessionId),
    index().on(t.userId),
    index().on(t.authorizationCodeId),
  ],
);

/** Opaque access tokens only (MCP tokens are JWTs and aren't stored). */
export const oauthAccessToken = pgTable(
  'oauth_access_token',
  {
    id: text().primaryKey(),
    token: text().unique(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    sessionId: text().references(() => session.id, { onDelete: 'set null' }),
    userId: text().references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text(),
    authorizationCodeId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    refreshId: text().references(() => oauthRefreshToken.id, { onDelete: 'cascade' }),
    expiresAt: ts(),
    createdAt: ts(),
    revoked: ts(),
    confirmation: jsonb(),
    scopes: text().array().notNull(),
  },
  (t) => [
    index().on(t.clientId),
    index().on(t.sessionId),
    index().on(t.userId),
    index().on(t.authorizationCodeId),
    index().on(t.refreshId),
  ],
);

/** What a user allowed a client to do (shown and revoked in Settings → Connections). */
export const oauthConsent = pgTable(
  'oauth_consent',
  {
    id: text().primaryKey(),
    clientId: text()
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: 'cascade' }),
    userId: text().references(() => user.id, { onDelete: 'cascade' }),
    referenceId: text(),
    resources: text().array(),
    requestedUserInfoClaims: text().array(),
    scopes: text().array().notNull(),
    createdAt: ts(),
    updatedAt: ts(),
  },
  (t) => [index().on(t.clientId), index().on(t.userId)],
);

/** Replay protection for client assertions (private_key_jwt). */
export const oauthClientAssertion = pgTable('oauth_client_assertion', {
  id: text().primaryKey(),
  expiresAt: ts().notNull(),
});
