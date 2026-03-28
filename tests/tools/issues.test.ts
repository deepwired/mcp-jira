import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createIssueTools } from '../../src/tools/issues.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work', 'write:jira-work'],
};

function makeClient() {
  return new JiraClient(testConfig);
}

describe('jira_get_issue', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('1. valid key calls correct endpoint and returns parsed fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        key: 'PROJ-123',
        id: '10001',
        fields: {
          summary: 'Fix bug',
          status: { name: 'Open' },
          issuetype: { name: 'Bug' },
          priority: { name: 'High' },
          assignee: { displayName: 'Alice' },
          reporter: { displayName: 'Bob' },
          labels: ['urgent'],
          description: 'A bug description',
        },
      }),
      headers: new Headers(),
    });

    const tools = createIssueTools(makeClient());
    const result = await tools.jira_get_issue.handler({ issueKey: 'PROJ-123' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('PROJ-123');
    expect(result.content[0].text).toContain('Fix bug');
    expect(result.content[0].text).toContain('Open');
    expect(result.content[0].text).toContain('Alice');
  });

  it('2. empty issueKey throws validation error', async () => {
    const tools = createIssueTools(makeClient());
    await expect(tools.jira_get_issue.handler({ issueKey: '' })).rejects.toThrow();
  });
});

describe('jira_create_issue', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('5. creates issue with all required fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ key: 'PROJ-999', id: '20001' }),
      headers: new Headers(),
    });

    const tools = createIssueTools(makeClient());
    const result = await tools.jira_create_issue.handler({
      projectKey: 'PROJ',
      summary: 'New task',
      issueType: 'Task',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('PROJ-999');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.fields.project.key).toBe('PROJ');
    expect(body.fields.summary).toBe('New task');
    expect(body.fields.issuetype.name).toBe('Task');
  });

  it('6. missing projectKey throws validation error', async () => {
    const tools = createIssueTools(makeClient());
    await expect(
      tools.jira_create_issue.handler({ summary: 'Test', issueType: 'Task' }),
    ).rejects.toThrow();
  });

  it('7. missing summary throws validation error', async () => {
    const tools = createIssueTools(makeClient());
    await expect(
      tools.jira_create_issue.handler({ projectKey: 'PROJ', issueType: 'Task' }),
    ).rejects.toThrow();
  });
});

describe('jira_update_issue', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('11. partial update only sends specified fields', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const tools = createIssueTools(makeClient());
    const result = await tools.jira_update_issue.handler({
      issueKey: 'PROJ-1',
      summary: 'Updated title',
    });
    expect(result.isError).toBeFalsy();

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.fields.summary).toBe('Updated title');
    expect(body.fields.description).toBeUndefined();
    expect(body.fields.assignee).toBeUndefined();
  });

  it('sends customFields in PUT body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const tools = createIssueTools(makeClient());
    const result = await tools.jira_update_issue.handler({
      issueKey: 'PROJ-1',
      customFields: { customfield_10016: 3, customfield_10357: { value: 'Bug' } },
    });
    expect(result.isError).toBeFalsy();

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.fields.customfield_10016).toBe(3);
    expect(body.fields.customfield_10357).toEqual({ value: 'Bug' });
  });
});

describe('jira_transition_issue', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('10. lists available transitions when no transitionId provided', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        transitions: [
          { id: '21', name: 'In Progress', to: { name: 'In Progress' } },
          { id: '31', name: 'Done', to: { name: 'Done' } },
        ],
      }),
      headers: new Headers(),
    });

    const tools = createIssueTools(makeClient());
    const result = await tools.jira_transition_issue.handler({ issueKey: 'PROJ-1' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('In Progress');
    expect(result.content[0].text).toContain('Done');
    expect(result.content[0].text).toContain('21');
  });
});

describe('jira_delete_issue', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('7/8. blocks deletion without confirm: true', async () => {
    const tools = createIssueTools(makeClient());
    const result = await tools.jira_delete_issue.handler({
      issueKey: 'PROJ-1',
      confirm: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/confirm.*true/i);
  });

  it('allows deletion with confirm: true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const tools = createIssueTools(makeClient());
    const result = await tools.jira_delete_issue.handler({
      issueKey: 'PROJ-1',
      confirm: true,
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('deleted');
  });
});
