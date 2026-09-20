/**
 * The set of scope strings this server recognises in JIRA_SCOPES.
 *
 * Atlassian exposes no way to read a token's scopes back after creation, and no
 * way to edit them — changing scopes means minting a new token. So the server
 * cannot introspect what the token can actually do; JIRA_SCOPES is the operator's
 * declaration of intent, and it is enforced locally before any API call.
 *
 * Phase 2 extends this with the granular (`read:issue:jira`-style) catalog.
 */

export const CLASSIC_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'read:me',
] as const;

export const KNOWN_SCOPES: ReadonlySet<string> = new Set<string>(CLASSIC_SCOPES);
