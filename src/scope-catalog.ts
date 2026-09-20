/**
 * Scope and toolset catalog.
 *
 * Two things this file has to get right, both forced by Atlassian's design:
 *
 * 1. Atlassian exposes no way to read a token's scopes back after creation, and
 *    no way to edit them — changing scopes means minting a new token. The server
 *    therefore cannot introspect what the token can do. JIRA_SCOPES is the
 *    operator's declaration, enforced locally before any API call is made.
 *
 * 2. Most Jira platform endpoints accept EITHER a classic scope (read:jira-work)
 *    OR a granular one (read:issue:jira). Jira Software is the exception: it has
 *    no classic scopes at all, so agile tools require granular scopes and cannot
 *    be satisfied by read:jira-work.
 *
 * Tokens are also capped at 50 scopes, so the README ships a per-toolset list
 * rather than telling people to select everything.
 */

export const CLASSIC_SCOPES = [
  'read:jira-work',
  'write:jira-work',
  'read:jira-user',
  'read:me',
] as const;

/** Granular Jira platform scopes, verified against Atlassian's OpenAPI spec. */
export const GRANULAR_PLATFORM_SCOPES = [
  'read:issue:jira',
  'write:issue:jira',
  'delete:issue:jira',
  'read:issue-details:jira',
  'read:issue-meta:jira',
  'read:issue.changelog:jira',
  'read:issue.remote-link:jira',
  'write:issue.remote-link:jira',
  'read:issue.watcher:jira',
  'write:issue.watcher:jira',
  'read:issue-worklog:jira',
  'write:issue-worklog:jira',
  'delete:issue-worklog:jira',
  'read:comment:jira',
  'write:comment:jira',
  'delete:comment:jira',
  'read:attachment:jira',
  'write:attachment:jira',
  'delete:attachment:jira',
  'read:project:jira',
  'read:project-version:jira',
  'write:project-version:jira',
  'delete:project-version:jira',
  'read:project.component:jira',
  'write:project.component:jira',
  'delete:project.component:jira',
  'read:filter:jira',
  'write:filter:jira',
  'read:field:jira',
  'read:jql:jira',
  'read:status:jira',
  'read:user:jira',
  'read:label:jira',
  'manage:jira-project',
] as const;

/** Jira Software. These have no classic equivalent — granular or nothing. */
export const GRANULAR_SOFTWARE_SCOPES = [
  'read:board-scope:jira-software',
  'write:board-scope:jira-software',
  'read:board-scope.admin:jira-software',
  'read:sprint:jira-software',
  'write:sprint:jira-software',
  'delete:sprint:jira-software',
  'read:epic:jira-software',
  'write:epic:jira-software',
  'read:issue:jira-software',
  'write:issue:jira-software',
] as const;

export const KNOWN_SCOPES: ReadonlySet<string> = new Set<string>([
  ...CLASSIC_SCOPES,
  ...GRANULAR_PLATFORM_SCOPES,
  ...GRANULAR_SOFTWARE_SCOPES,
]);

// ---------------------------------------------------------------------------
// Toolsets
// ---------------------------------------------------------------------------

/**
 * Tool-count gating. Anthropic documents selection accuracy degrading past
 * 30-50 tools, and VS Code caps a request at 128. Gating is introduced
 * additively: the default is everything that shipped through Phase 3, so no
 * existing setup loses a tool on upgrade.
 */
export const TOOLSETS = {
  core: { default: true, description: 'Issues, search, comments, transitions, projects, fields' },
  users: { default: true, description: 'User lookup and the authenticated account' },
  attachments: { default: true, description: 'List, upload, download and delete attachments' },
  links: { default: true, description: 'Issue links and remote (external) links' },
  worklogs: { default: true, description: 'Read and write work logs' },
  metadata: { default: true, description: 'Create metadata and issue changelogs' },
  agile: { default: false, description: 'Boards and sprints (needs jira-software scopes)' },
  versions: { default: false, description: 'Project versions and components' },
  filters: { default: false, description: 'Saved filters' },
  labels: { default: false, description: 'Label discovery' },
} as const;

export type Toolset = keyof typeof TOOLSETS;

export const DEFAULT_TOOLSETS: Toolset[] = (
  Object.entries(TOOLSETS) as Array<[Toolset, { default: boolean }]>
)
  .filter(([, meta]) => meta.default)
  .map(([name]) => name);

export function parseToolsets(raw: string | undefined): Toolset[] {
  if (!raw || raw.trim() === '') return DEFAULT_TOOLSETS;

  const requested = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');

  if (requested.length === 0) return DEFAULT_TOOLSETS;

  const resolved = new Set<Toolset>();
  const unknown: string[] = [];

  for (const name of requested) {
    if (name === 'all') {
      (Object.keys(TOOLSETS) as Toolset[]).forEach((t) => resolved.add(t));
    } else if (name === 'default') {
      DEFAULT_TOOLSETS.forEach((t) => resolved.add(t));
    } else if (name in TOOLSETS) {
      resolved.add(name as Toolset);
    } else {
      unknown.push(name);
    }
  }

  if (unknown.length > 0) {
    throw new Error(
      `Unrecognised toolset(s) in JIRA_TOOLSETS: ${unknown.join(', ')}.\n` +
        `Available: ${Object.keys(TOOLSETS).join(', ')}, plus "default" and "all".`,
    );
  }

  return [...resolved];
}
