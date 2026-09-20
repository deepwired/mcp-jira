import { describe, it, expect } from 'vitest';
import { enforceScope, getAvailableTools, TOOL_SPECS } from '../src/scopes.js';
import { DEFAULT_TOOLSETS, parseToolsets } from '../src/scope-catalog.js';
import { parseScopes } from '../src/auth.js';
import type { Scope } from '../src/types.js';

describe('Scope Enforcement', () => {
  it('1. blocks write tool when only read scope granted', () => {
    expect(() => enforceScope('jira_create_issue', ['read:jira-work'])).toThrow(
      /requires one of \[write:jira-work, write:issue:jira\]/,
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

  it('6. rejects unknown scopes loudly instead of degrading to an inert server', () => {
    expect(() => parseScopes('read:jira-work,bogus:scope,write:jira-work')).toThrow(
      /bogus:scope/,
    );
  });

  it('7. blocks jira_delete_issue when confirm is not checked (scope-level)', () => {
    // Scope enforcement itself just checks scopes — confirm is a tool-level check
    // But if write scope is missing, it blocks before confirm is ever checked
    expect(() => enforceScope('jira_delete_issue', ['read:jira-work'])).toThrow(
      /requires one of \[write:jira-work, delete:issue:jira\]/,
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

  it('returns every default-toolset tool the classic scopes can reach', () => {
    const allScopes: Scope[] = ['read:jira-work', 'write:jira-work', 'read:jira-user', 'read:me'];
    const tools = getAvailableTools(allScopes);
    const expected = Object.entries(TOOL_SPECS).filter(
      ([, spec]) => DEFAULT_TOOLSETS.includes(spec.toolset),
    );
    expect(tools).toHaveLength(expected.length);
  });
});

describe('classic / granular scope equivalence', () => {
  it('accepts a granular scope in place of the classic one', () => {
    expect(() => enforceScope('jira_get_issue', ['read:issue:jira'])).not.toThrow();
    expect(() => enforceScope('jira_create_issue', ['write:issue:jira'])).not.toThrow();
  });

  it('still accepts the classic scope', () => {
    expect(() => enforceScope('jira_get_issue', ['read:jira-work'])).not.toThrow();
  });

  it('agile tools reject classic scopes — jira-software has none', () => {
    // read:jira-work cannot satisfy /rest/agile/1.0; this is the trap behind the
    // widely-repeated claim that scoped tokens cannot reach the Software API.
    expect(() => enforceScope('jira_list_boards', ['read:jira-work'])).toThrow(
      /read:board-scope:jira-software/,
    );
  });

  it('board access needs read:project:jira alongside the board scope', () => {
    expect(() => enforceScope('jira_list_boards', ['read:board-scope:jira-software'])).toThrow(
      /read:project:jira/,
    );
    expect(() =>
      enforceScope('jira_list_boards', ['read:board-scope:jira-software', 'read:project:jira']),
    ).not.toThrow();
  });
});

describe('toolset gating', () => {
  const allScopes: Scope[] = [
    'read:jira-work',
    'write:jira-work',
    'read:jira-user',
    'read:me',
    'read:board-scope:jira-software',
    'read:project:jira',
    'read:sprint:jira-software',
  ];

  it('hides non-default toolsets unless asked for', () => {
    expect(getAvailableTools(allScopes)).not.toContain('jira_list_boards');
    expect(getAvailableTools(allScopes, ['agile'])).toContain('jira_list_boards');
  });

  it('"all" resolves to every toolset', () => {
    expect(parseToolsets('all')).toEqual(expect.arrayContaining(['core', 'agile', 'labels']));
  });

  it('"default" resolves to the default set', () => {
    expect(parseToolsets('default')).toEqual(DEFAULT_TOOLSETS);
  });

  it('an unset value yields the defaults', () => {
    expect(parseToolsets(undefined)).toEqual(DEFAULT_TOOLSETS);
  });

  it('rejects an unknown toolset by name', () => {
    expect(() => parseToolsets('core,nonsense')).toThrow(/nonsense/);
  });

  it('deduplicates overlapping selectors', () => {
    expect(parseToolsets('default,core').filter((t) => t === 'core')).toHaveLength(1);
  });

  it('every default toolset is reachable with classic scopes alone', () => {
    // If this fails, the default set has drifted into needing granular scopes,
    // which would silently hide tools for existing users on upgrade.
    const classic: Scope[] = ['read:jira-work', 'write:jira-work', 'read:jira-user', 'read:me'];
    const reachable = getAvailableTools(classic, DEFAULT_TOOLSETS);
    const declared = Object.entries(TOOL_SPECS).filter(([, s]) =>
      DEFAULT_TOOLSETS.includes(s.toolset),
    );
    expect(reachable).toHaveLength(declared.length);
  });
});
