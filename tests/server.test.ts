import { describe, it, expect } from 'vitest';
import { buildInstructions, unspecifiedTools } from '../src/index.js';
import { TOOL_SPECS } from '../src/scopes.js';
import { DEFAULT_TOOLSETS, TOOLSETS, type Toolset } from '../src/scope-catalog.js';
import { JiraClient } from '../src/client.js';
import type { JiraConfig } from '../src/types.js';
import { createIssueTools } from '../src/tools/issues.js';
import { createSearchTools } from '../src/tools/search.js';
import { createCommentTools } from '../src/tools/comments.js';
import { createProjectTools } from '../src/tools/projects.js';
import { createUserTools } from '../src/tools/users.js';
import { createLinkTools } from '../src/tools/links.js';
import { createAttachmentTools } from '../src/tools/attachments.js';
import { createFieldTools } from '../src/tools/fields.js';
import { createWorklogTools } from '../src/tools/worklogs.js';
import { createMetaTools } from '../src/tools/meta.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work'],
};

function allImplementedToolNames(): string[] {
  const client = new JiraClient(testConfig);
  return Object.keys({
    ...createIssueTools(client),
    ...createSearchTools(client),
    ...createCommentTools(client),
    ...createProjectTools(client),
    ...createUserTools(client),
    ...createLinkTools(client),
    ...createAttachmentTools(client),
    ...createFieldTools(client),
    ...createWorklogTools(client),
    ...createMetaTools(client),
  });
}

describe('tool registry integrity', () => {
  it('every implemented tool has a scope spec', () => {
    // Without a spec a tool is unreachable: enforceScope throws "Unknown tool"
    // and getAvailableTools never returns it. Silent, so assert it.
    expect(unspecifiedTools(allImplementedToolNames())).toEqual([]);
  });

  it('every spec belongs to a real toolset', () => {
    const valid = Object.keys(TOOLSETS);
    const bad = Object.entries(TOOL_SPECS)
      .filter(([, spec]) => !valid.includes(spec.toolset))
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });

  it('every spec has at least one requirement group with at least one scope', () => {
    const bad = Object.entries(TOOL_SPECS)
      .filter(([, s]) => s.requires.length === 0 || s.requires.some((g) => g.length === 0))
      .map(([name]) => name);
    expect(bad).toEqual([]);
  });

  it('tool names are namespaced consistently', () => {
    const bad = Object.keys(TOOL_SPECS).filter((n) => !n.startsWith('jira_'));
    expect(bad).toEqual([]);
  });

  it('no implemented tool is missing from the registry and vice versa for shipped toolsets', () => {
    // Specs may run ahead of implementations for not-yet-built toolsets, but a
    // default-toolset spec with no implementation would advertise a tool that
    // cannot be registered.
    const implemented = new Set(allImplementedToolNames());
    const missing = Object.entries(TOOL_SPECS)
      .filter(([name, spec]) => DEFAULT_TOOLSETS.includes(spec.toolset) && !implemented.has(name))
      .map(([name]) => name);
    expect(missing).toEqual([]);
  });
});

describe('server instructions', () => {
  const classic = ['read:jira-work', 'write:jira-work', 'read:jira-user', 'read:me'];

  it('names the enabled toolsets', () => {
    const text = buildInstructions(DEFAULT_TOOLSETS, classic);
    expect(text).toContain('Enabled toolsets:');
    expect(text).toContain('core');
  });

  it('names what is not loaded, so gated capability stays discoverable', () => {
    const text = buildInstructions(DEFAULT_TOOLSETS, classic);
    expect(text).toContain('Not loaded');
    expect(text).toContain('agile');
    expect(text).toContain('JIRA_TOOLSETS');
  });

  it('omits the not-loaded section when everything is enabled', () => {
    const text = buildInstructions(Object.keys(TOOLSETS) as Toolset[], classic);
    expect(text).not.toContain('Not loaded');
  });

  it('warns when an enabled toolset is unreachable with the granted scopes', () => {
    const text = buildInstructions(['core', 'agile'] as Toolset[], classic);
    expect(text).toContain('partly unreachable');
    expect(text).toContain('agile');
  });

  it('documents the three behaviours most likely to be got wrong', () => {
    const text = buildInstructions(DEFAULT_TOOLSETS, classic);
    expect(text).toContain('nextPageToken');
    expect(text).toContain('Markdown');
    expect(text).toContain('null clears it');
  });
});
