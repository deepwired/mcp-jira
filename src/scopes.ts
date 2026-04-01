import { Scope } from './types.js';

export const TOOL_SCOPE_MAP: Record<string, Scope[]> = {
  jira_get_issue: ['read:jira-work'],
  jira_search: ['read:jira-work'],
  jira_list_comments: ['read:jira-work'],
  jira_list_projects: ['read:jira-work'],
  jira_get_project: ['read:jira-work'],
  jira_list_link_types: ['read:jira-work'],
  jira_list_fields: ['read:jira-work'],
  jira_list_attachments: ['read:jira-work'],
  jira_get_transitions: ['read:jira-work'],
  jira_create_issue: ['write:jira-work'],
  jira_update_issue: ['write:jira-work'],
  jira_add_comment: ['write:jira-work'],
  jira_update_comment: ['write:jira-work'],
  jira_transition_issue: ['write:jira-work'],
  jira_delete_issue: ['write:jira-work'],
  jira_link_issues: ['write:jira-work'],
  jira_add_attachment: ['write:jira-work'],
  jira_delete_attachment: ['write:jira-work'],
  jira_get_user: ['read:jira-user'],
  jira_search_users: ['read:jira-user'],
};

export function enforceScope(tool: string, grantedScopes: Scope[]): void {
  const required = TOOL_SCOPE_MAP[tool];
  if (!required) {
    throw new Error(`Unknown tool: ${tool}`);
  }

  for (const scope of required) {
    if (!grantedScopes.includes(scope)) {
      throw new Error(
        `Scope enforcement: tool "${tool}" requires scope "${scope}" which is not granted. ` +
          `Granted scopes: [${grantedScopes.join(', ')}]`,
      );
    }
  }
}

export function getAvailableTools(grantedScopes: Scope[]): string[] {
  return Object.entries(TOOL_SCOPE_MAP)
    .filter(([_, required]) => required.every((s) => grantedScopes.includes(s)))
    .map(([name]) => name);
}
