import { Scope } from './types.js';
import { Toolset, DEFAULT_TOOLSETS } from './scope-catalog.js';

export interface ToolSpec {
  /**
   * Each inner array is one requirement, satisfied if ANY of its scopes is
   * granted. All requirements must be satisfied. This models Atlassian's
   * classic-or-granular equivalence: read:jira-work OR read:issue:jira.
   */
  requires: string[][];
  toolset: Toolset;
}

export const TOOL_SPECS: Record<string, ToolSpec> = {
  // --- core -----------------------------------------------------------------
  jira_get_issue: { requires: [['read:jira-work', 'read:issue:jira']], toolset: 'core' },
  jira_search: { requires: [['read:jira-work', 'read:issue-details:jira']], toolset: 'core' },
  jira_list_comments: { requires: [['read:jira-work', 'read:comment:jira']], toolset: 'core' },
  jira_list_projects: { requires: [['read:jira-work', 'read:project:jira']], toolset: 'core' },
  jira_get_project: { requires: [['read:jira-work', 'read:project:jira']], toolset: 'core' },
  jira_list_fields: { requires: [['read:jira-work', 'read:field:jira']], toolset: 'core' },
  jira_get_transitions: { requires: [['read:jira-work', 'read:issue:jira']], toolset: 'core' },
  jira_create_issue: { requires: [['write:jira-work', 'write:issue:jira']], toolset: 'core' },
  jira_update_issue: { requires: [['write:jira-work', 'write:issue:jira']], toolset: 'core' },
  jira_assign_issue: { requires: [['write:jira-work', 'write:issue:jira']], toolset: 'core' },
  jira_transition_issue: { requires: [['write:jira-work', 'write:issue:jira']], toolset: 'core' },
  jira_delete_issue: { requires: [['write:jira-work', 'delete:issue:jira']], toolset: 'core' },
  jira_add_comment: { requires: [['write:jira-work', 'write:comment:jira']], toolset: 'core' },
  jira_update_comment: { requires: [['write:jira-work', 'write:comment:jira']], toolset: 'core' },
  jira_delete_comment: {
    requires: [['write:jira-work', 'delete:comment:jira', 'write:comment:jira']],
    toolset: 'core',
  },

  // --- users ----------------------------------------------------------------
  jira_get_user: { requires: [['read:jira-user', 'read:user:jira']], toolset: 'users' },
  jira_search_users: { requires: [['read:jira-user', 'read:user:jira']], toolset: 'users' },
  jira_get_myself: { requires: [['read:me', 'read:jira-user', 'read:user:jira']], toolset: 'users' },

  // --- attachments ----------------------------------------------------------
  jira_list_attachments: {
    requires: [['read:jira-work', 'read:attachment:jira']],
    toolset: 'attachments',
  },
  jira_add_attachment: {
    requires: [['write:jira-work', 'write:attachment:jira']],
    toolset: 'attachments',
  },
  jira_download_attachment: {
    requires: [['read:jira-work', 'read:attachment:jira']],
    toolset: 'attachments',
  },
  jira_delete_attachment: {
    requires: [['write:jira-work', 'delete:attachment:jira']],
    toolset: 'attachments',
  },

  // --- links ----------------------------------------------------------------
  jira_list_link_types: { requires: [['read:jira-work', 'read:issue:jira']], toolset: 'links' },
  jira_link_issues: { requires: [['write:jira-work', 'write:issue:jira']], toolset: 'links' },
  jira_remove_link: { requires: [['write:jira-work', 'write:issue:jira']], toolset: 'links' },
  jira_list_remote_links: {
    requires: [['read:jira-work', 'read:issue.remote-link:jira']],
    toolset: 'links',
  },
  jira_create_remote_link: {
    requires: [['write:jira-work', 'write:issue.remote-link:jira']],
    toolset: 'links',
  },
  jira_delete_remote_link: {
    requires: [['write:jira-work', 'write:issue.remote-link:jira']],
    toolset: 'links',
  },

  // --- worklogs -------------------------------------------------------------
  jira_list_worklogs: {
    requires: [['read:jira-work', 'read:issue-worklog:jira']],
    toolset: 'worklogs',
  },
  jira_add_worklog: {
    requires: [['write:jira-work', 'write:issue-worklog:jira']],
    toolset: 'worklogs',
  },
  jira_update_worklog: {
    requires: [['write:jira-work', 'write:issue-worklog:jira']],
    toolset: 'worklogs',
  },
  jira_delete_worklog: {
    requires: [['write:jira-work', 'delete:issue-worklog:jira', 'write:issue-worklog:jira']],
    toolset: 'worklogs',
  },

  // --- metadata -------------------------------------------------------------
  jira_get_create_meta: {
    requires: [['read:jira-work', 'read:issue-meta:jira']],
    toolset: 'metadata',
  },
  jira_get_changelog: {
    requires: [['read:jira-work', 'read:issue.changelog:jira']],
    toolset: 'metadata',
  },

  // --- agile (jira-software has NO classic scopes) --------------------------
  jira_list_boards: {
    requires: [['read:board-scope:jira-software'], ['read:project:jira', 'read:jira-work']],
    toolset: 'agile',
  },
  jira_list_sprints: { requires: [['read:sprint:jira-software']], toolset: 'agile' },
  jira_get_sprint_issues: {
    requires: [['read:sprint:jira-software'], ['read:issue-details:jira', 'read:jira-work']],
    toolset: 'agile',
  },
  jira_manage_sprint: { requires: [['write:sprint:jira-software']], toolset: 'agile' },

  // --- versions & components ------------------------------------------------
  jira_list_versions: {
    requires: [['read:jira-work', 'read:project-version:jira']],
    toolset: 'versions',
  },
  jira_manage_version: {
    requires: [['manage:jira-project', 'write:project-version:jira']],
    toolset: 'versions',
  },
  jira_list_components: {
    requires: [['read:jira-work', 'read:project.component:jira']],
    toolset: 'versions',
  },

  // --- filters --------------------------------------------------------------
  jira_list_filters: { requires: [['read:jira-work', 'read:filter:jira']], toolset: 'filters' },
  jira_get_filter: { requires: [['read:jira-work', 'read:filter:jira']], toolset: 'filters' },

  // --- labels ---------------------------------------------------------------
  jira_list_labels: { requires: [['read:jira-work', 'read:label:jira']], toolset: 'labels' },
};

/** Legacy shape, kept so pre-2.0 importers keep resolving. */
export const TOOL_SCOPE_MAP: Record<string, Scope[]> = Object.fromEntries(
  Object.entries(TOOL_SPECS).map(([name, spec]) => [name, spec.requires.map((g) => g[0]) as Scope[]]),
);

function satisfies(requires: string[][], granted: readonly string[]): boolean {
  return requires.every((group) => group.some((scope) => granted.includes(scope)));
}

export function enforceScope(tool: string, grantedScopes: Scope[]): void {
  const spec = TOOL_SPECS[tool];
  if (!spec) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  for (const group of spec.requires) {
    if (!group.some((scope) => grantedScopes.includes(scope as Scope))) {
      const options = group.length === 1 ? `"${group[0]}"` : `one of [${group.join(', ')}]`;
      throw new Error(
        `Scope enforcement: tool "${tool}" requires ${options} which is not granted. ` +
          `Granted scopes: [${grantedScopes.join(', ')}]`,
      );
    }
  }
}

export function getAvailableTools(
  grantedScopes: Scope[],
  enabledToolsets: Toolset[] = DEFAULT_TOOLSETS,
): string[] {
  return Object.entries(TOOL_SPECS)
    .filter(
      ([, spec]) =>
        enabledToolsets.includes(spec.toolset) && satisfies(spec.requires, grantedScopes),
    )
    .map(([name]) => name);
}

/** Toolsets that hold at least one tool the granted scopes cannot reach. */
export function unreachableToolsets(grantedScopes: Scope[]): Toolset[] {
  const blocked = new Set<Toolset>();
  for (const spec of Object.values(TOOL_SPECS)) {
    if (!satisfies(spec.requires, grantedScopes)) blocked.add(spec.toolset);
  }
  return [...blocked];
}
