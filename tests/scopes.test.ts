import { describe, it, expect } from 'vitest';
import { enforceScope, getAvailableTools, TOOL_SCOPE_MAP } from '../src/scopes.js';
import { parseScopes } from '../src/auth.js';
import type { Scope } from '../src/types.js';

describe('Scope Enforcement', () => {
  it('1. blocks write tool when only read scope granted', () => {
    expect(() => enforceScope('jira_create_issue', ['read:jira-work'])).toThrow(
      /requires scope "write:jira-work"/,
    );
  });

  it('2. allows read tool when read scope granted', () => {
    expect(() => enforceScope('jira_get_issue', ['read:jira-work'])).not.toThrow();
  });

  it('3. allows write tool when both read and write scopes granted', () => {
    expect(() =>
      enforceScope('jira_create_issue', ['read:jira-work', 'write:jira-work']),
    ).not.toThrow();
  });

  it('4. defaults to read:jira-work when JIRA_SCOPES not set', () => {
    const scopes = parseScopes(undefined);
    expect(scopes).toEqual(['read:jira-work']);
  });

  it('5. defaults to read:jira-work when JIRA_SCOPES is empty string', () => {
    const scopes = parseScopes('');
    expect(scopes).toEqual(['read:jira-work']);
  });

  it('6. ignores unknown scopes without crashing', () => {
    const scopes = parseScopes('read:jira-work,bogus:scope,write:jira-work');
    expect(scopes).toEqual(['read:jira-work', 'write:jira-work']);
  });

  it('7. blocks jira_delete_issue when confirm is not checked (scope-level)', () => {
    // Scope enforcement itself just checks scopes — confirm is a tool-level check
    // But if write scope is missing, it blocks before confirm is ever checked
    expect(() => enforceScope('jira_delete_issue', ['read:jira-work'])).toThrow(
      /requires scope "write:jira-work"/,
    );
  });

  it('8. allows jira_delete_issue when write scope granted', () => {
    expect(() =>
      enforceScope('jira_delete_issue', ['read:jira-work', 'write:jira-work']),
    ).not.toThrow();
  });

  it('throws on unknown tool', () => {
    expect(() => enforceScope('nonexistent_tool', ['read:jira-work'])).toThrow(/Unknown tool/);
  });
});

describe('getAvailableTools', () => {
  it('returns only read tools for read:jira-work scope', () => {
    const tools = getAvailableTools(['read:jira-work']);
    expect(tools).toContain('jira_get_issue');
    expect(tools).toContain('jira_search');
    expect(tools).toContain('jira_list_comments');
    expect(tools).toContain('jira_list_projects');
    expect(tools).toContain('jira_get_project');
    expect(tools).not.toContain('jira_create_issue');
    expect(tools).not.toContain('jira_update_issue');
    expect(tools).not.toContain('jira_delete_issue');
    expect(tools).not.toContain('jira_get_user');
  });

  it('returns read + write tools for both scopes', () => {
    const tools = getAvailableTools(['read:jira-work', 'write:jira-work']);
    expect(tools).toContain('jira_get_issue');
    expect(tools).toContain('jira_create_issue');
    expect(tools).toContain('jira_delete_issue');
    expect(tools).not.toContain('jira_get_user');
  });

  it('returns all 12 tools when all scopes granted', () => {
    const allScopes: Scope[] = ['read:jira-work', 'write:jira-work', 'read:jira-user', 'read:me'];
    const tools = getAvailableTools(allScopes);
    expect(tools).toHaveLength(Object.keys(TOOL_SCOPE_MAP).length);
  });
});
