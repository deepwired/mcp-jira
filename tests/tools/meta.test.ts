import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createMetaTools } from '../../src/tools/meta.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work'],
};

function tools() {
  return createMetaTools(new JiraClient(testConfig));
}

function mockJson(body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  });
  global.fetch = fetchMock;
  return fetchMock;
}

describe('jira_get_create_meta', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists issue types when no issueTypeId is given', async () => {
    const fetchMock = mockJson({
      issueTypes: [
        { id: '10001', name: 'Story' },
        { id: '10002', name: 'Sub-task', subtask: true },
      ],
    });

    const res = await tools().jira_get_create_meta.handler({ projectKey: 'TRAP' });
    expect(fetchMock.mock.calls[0][0]).toContain('/issue/createmeta/TRAP/issuetypes');
    expect(res.content[0].text).toContain('Story');
    expect(res.content[0].text).toContain('_[subtask]_');
  });

  it('returns required fields with allowed values for a given type', async () => {
    mockJson({
      fields: [
        {
          fieldId: 'customfield_10104',
          name: 'Work Category',
          required: true,
          schema: { type: 'option' },
          allowedValues: [{ value: 'Product' }, { value: 'Tech Debt' }],
        },
        { fieldId: 'description', name: 'Description', required: false, schema: { type: 'doc' } },
      ],
    });

    const res = await tools().jira_get_create_meta.handler({
      projectKey: 'TRAP',
      issueTypeId: '10001',
    });
    expect(res.content[0].text).toContain('customfield_10104');
    expect(res.content[0].text).toContain('Allowed: Product, Tech Debt');
    // requiredOnly defaults true, so the optional field is filtered out
    expect(res.content[0].text).not.toContain('Description');
  });

  it('includes optional fields when requiredOnly is false', async () => {
    mockJson({
      fields: [
        { fieldId: 'description', name: 'Description', required: false, schema: { type: 'doc' } },
      ],
    });
    const res = await tools().jira_get_create_meta.handler({
      projectKey: 'TRAP',
      issueTypeId: '10001',
      requiredOnly: false,
    });
    expect(res.content[0].text).toContain('Description');
  });

  it('truncates a long allowed-value list rather than dumping it', async () => {
    mockJson({
      fields: [
        {
          fieldId: 'customfield_1',
          name: 'Team',
          required: true,
          schema: { type: 'option' },
          allowedValues: Array.from({ length: 40 }, (_, i) => ({ value: `team-${i}` })),
        },
      ],
    });
    const res = await tools().jira_get_create_meta.handler({
      projectKey: 'TRAP',
      issueTypeId: '10001',
    });
    expect(res.content[0].text).toContain('(+25)');
  });

  it('flags an empty issue-type list as possibly a permissions problem', async () => {
    mockJson({ issueTypes: [] });
    const res = await tools().jira_get_create_meta.handler({ projectKey: 'TRAP' });
    expect(res.content[0].text).toMatch(/project-permission problem/);
  });
});

describe('jira_get_changelog', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const CHANGELOG = {
    total: 2,
    values: [
      {
        id: '1',
        created: '2026-09-01T10:00:00.000+0000',
        author: { displayName: 'Alice' },
        items: [{ field: 'status', fromString: 'To Do', toString: 'In Progress' }],
      },
      {
        id: '2',
        created: '2026-09-02T10:00:00.000+0000',
        author: { displayName: 'Bob' },
        items: [{ field: 'assignee', fromString: null, toString: 'Carol' }],
      },
    ],
  };

  it('renders who changed what, from and to', async () => {
    mockJson(CHANGELOG);
    const res = await tools().jira_get_changelog.handler({ issueKey: 'PROJ-1' });
    expect(res.content[0].text).toContain('status: To Do → In Progress');
    expect(res.content[0].text).toContain('assignee: (none) → Carol');
  });

  it('filters to a single field when asked', async () => {
    mockJson(CHANGELOG);
    const res = await tools().jira_get_changelog.handler({
      issueKey: 'PROJ-1',
      field: 'status',
    });
    expect(res.content[0].text).toContain('status:');
    expect(res.content[0].text).not.toContain('assignee:');
  });

  it('reports no matches for a field that never changed', async () => {
    mockJson(CHANGELOG);
    const res = await tools().jira_get_changelog.handler({
      issueKey: 'PROJ-1',
      field: 'priority',
    });
    expect(res.content[0].text).toContain('No changes to "priority"');
  });

  it('handles an issue with no history', async () => {
    mockJson({ total: 0, values: [] });
    const res = await tools().jira_get_changelog.handler({ issueKey: 'PROJ-1' });
    expect(res.content[0].text).toContain('No change history');
  });
});
