import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createWorklogTools } from '../../src/tools/worklogs.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work', 'write:jira-work'],
};

function tools() {
  return createWorklogTools(new JiraClient(testConfig));
}

function mockJson(body: unknown, status = 200) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
    headers: new Headers(),
  });
  global.fetch = fetchMock;
  return fetchMock;
}

function mockNoContent() {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    json: () => Promise.resolve({}),
    headers: new Headers({ 'content-length': '0' }),
  });
  global.fetch = fetchMock;
  return fetchMock;
}

describe('jira_list_worklogs', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists entries and totals the time shown', async () => {
    mockJson({
      total: 2,
      worklogs: [
        {
          id: '1',
          author: { displayName: 'Alice' },
          timeSpent: '2h',
          timeSpentSeconds: 7200,
          started: '2026-09-01T09:00:00.000+0000',
        },
        {
          id: '2',
          author: { displayName: 'Bob' },
          timeSpent: '30m',
          timeSpentSeconds: 1800,
          started: '2026-09-02T09:00:00.000+0000',
        },
      ],
    });

    const res = await tools().jira_list_worklogs.handler({ issueKey: 'PROJ-1' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('Alice');
    expect(res.content[0].text).toContain('2h 30m shown');
  });

  it('renders a worklog comment inline', async () => {
    mockJson({
      total: 1,
      worklogs: [
        {
          id: '1',
          author: { displayName: 'Alice' },
          timeSpent: '1h',
          timeSpentSeconds: 3600,
          started: '2026-09-01T09:00:00.000+0000',
          comment: {
            type: 'doc',
            version: 1,
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'pairing' }] }],
          },
        },
      ],
    });

    const res = await tools().jira_list_worklogs.handler({ issueKey: 'PROJ-1' });
    expect(res.content[0].text).toContain('pairing');
  });

  it('reports an empty log plainly', async () => {
    mockJson({ total: 0, worklogs: [] });
    const res = await tools().jira_list_worklogs.handler({ issueKey: 'PROJ-1' });
    expect(res.content[0].text).toContain('No work logged');
  });
});

describe('jira_add_worklog', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('posts timeSpent and returns the new worklog id', async () => {
    const fetchMock = mockJson({ id: '555' }, 201);
    const res = await tools().jira_add_worklog.handler({ issueKey: 'PROJ-1', timeSpent: '2h' });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain('555');
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.timeSpent).toBe('2h');
    expect(body.started).toBeUndefined();
  });

  it('converts a markdown comment to ADF', async () => {
    const fetchMock = mockJson({ id: '556' }, 201);
    await tools().jira_add_worklog.handler({
      issueKey: 'PROJ-1',
      timeSpent: '1h',
      comment: '**pairing** with Bob',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.comment.type).toBe('doc');
    expect(body.comment.content[0].content[0].marks[0].type).toBe('strong');
  });

  it('requires timeSpent', async () => {
    await expect(tools().jira_add_worklog.handler({ issueKey: 'PROJ-1' })).rejects.toThrow();
  });
});

describe('jira_update_worklog', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends only the supplied fields', async () => {
    const fetchMock = mockNoContent();
    await tools().jira_update_worklog.handler({
      issueKey: 'PROJ-1',
      worklogId: '555',
      timeSpent: '3h',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ timeSpent: '3h' });
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
  });

  it('refuses a no-op update rather than sending an empty body', async () => {
    const res = await tools().jira_update_worklog.handler({
      issueKey: 'PROJ-1',
      worklogId: '555',
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('No changes supplied');
  });
});

describe('jira_delete_worklog', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('refuses without confirm: true', async () => {
    const res = await tools().jira_delete_worklog.handler({
      issueKey: 'PROJ-1',
      worklogId: '555',
      confirm: false,
    });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('safety guard');
  });

  it('deletes when confirmed', async () => {
    const fetchMock = mockNoContent();
    const res = await tools().jira_delete_worklog.handler({
      issueKey: 'PROJ-1',
      worklogId: '555',
      confirm: true,
    });
    expect(res.isError).toBeFalsy();
    expect(fetchMock.mock.calls[0][1].method).toBe('DELETE');
    expect(fetchMock.mock.calls[0][0]).toContain('/worklog/555');
  });
});
