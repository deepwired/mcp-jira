import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createFieldTools } from '../../src/tools/fields.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work'],
};

const mockFields = [
  {
    id: 'summary',
    name: 'Summary',
    custom: false,
    orderable: true,
    navigable: true,
    searchable: true,
    schema: { type: 'string' },
  },
  {
    id: 'status',
    name: 'Status',
    custom: false,
    orderable: false,
    navigable: true,
    searchable: true,
    schema: { type: 'status' },
  },
  {
    id: 'customfield_10016',
    name: 'Story Points',
    custom: true,
    orderable: true,
    navigable: true,
    searchable: true,
    schema: {
      type: 'number',
      custom: 'com.atlassian.jira.plugin.system.customfieldtypes:float',
      customId: 10016,
    },
  },
  {
    id: 'customfield_10104',
    name: 'Team',
    custom: true,
    orderable: true,
    navigable: true,
    searchable: true,
    schema: {
      type: 'option',
      custom: 'com.atlassian.jira.plugin.system.customfieldtypes:select',
      customId: 10104,
    },
  },
];

describe('jira_list_fields', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns all fields grouped by system and custom', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockFields),
      headers: new Headers(),
    });

    const tools = createFieldTools(new JiraClient(testConfig));
    const result = await tools.jira_list_fields.handler({});
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('Summary');
    expect(text).toContain('Status');
    expect(text).toContain('Story Points');
    expect(text).toContain('customfield_10016');
    expect(text).toContain('System Fields');
    expect(text).toContain('Custom Fields');
  });

  it('customOnly: true returns only custom fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockFields),
      headers: new Headers(),
    });

    const tools = createFieldTools(new JiraClient(testConfig));
    const result = await tools.jira_list_fields.handler({ customOnly: true });
    expect(result.isError).toBeFalsy();
    const text = result.content[0].text;
    expect(text).toContain('Story Points');
    expect(text).toContain('Team');
    expect(text).not.toContain('System Fields');
    expect(text).not.toContain('summary');
  });

  it('returns empty message when no fields found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([]),
      headers: new Headers(),
    });

    const tools = createFieldTools(new JiraClient(testConfig));
    const result = await tools.jira_list_fields.handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No fields found');
  });

  it('propagates API errors', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ errorMessages: ['Forbidden'] }),
      headers: new Headers(),
    });

    const tools = createFieldTools(new JiraClient(testConfig));
    const result = await tools.jira_list_fields.handler({});
    expect(result.isError).toBe(true);
  });
});
