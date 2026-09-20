import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createSearchTools } from '../../src/tools/search.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work'],
};

describe('jira_search', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('3. valid JQL calls search/jql endpoint with encoded query', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          issues: [
            {
              key: 'PROJ-1',
              id: '1',
              fields: {
                summary: 'First',
                status: { name: 'Open' },
                assignee: { displayName: 'Alice' },
              },
            },
            {
              key: 'PROJ-2',
              id: '2',
              fields: { summary: 'Second', status: { name: 'Done' }, assignee: null },
            },
          ],
          isLast: true,
        }),
      headers: new Headers(),
    });

    const tools = createSearchTools(new JiraClient(testConfig));
    const result = await tools.jira_search.handler({ jql: 'project = PROJ' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('PROJ-1');
    expect(result.content[0].text).toContain('PROJ-2');
    expect(result.content[0].text).toContain('2 issue(s)');

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('/rest/api/3/search/jql');
    expect(url).toContain('project');
  });

  it('4. empty JQL throws validation error', async () => {
    const tools = createSearchTools(new JiraClient(testConfig));
    await expect(tools.jira_search.handler({ jql: '' })).rejects.toThrow();
  });

  it('returns message when no results found', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ issues: [], isLast: true }),
      headers: new Headers(),
    });

    const tools = createSearchTools(new JiraClient(testConfig));
    const result = await tools.jira_search.handler({ jql: 'project = NOPE' });
    expect(result.content[0].text).toContain('No issues found');
  });

  it('surfaces nextPageToken so the next page is actually reachable', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          issues: [
            {
              key: 'PROJ-1',
              id: '1',
              fields: { summary: 'First', status: { name: 'Open' }, assignee: null },
            },
          ],
          nextPageToken: 'CAEaAggD',
        }),
      headers: new Headers(),
    });

    const tools = createSearchTools(new JiraClient(testConfig));
    const result = await tools.jira_search.handler({ jql: 'project = PROJ' });
    expect(result.content[0].text).toContain('More results available');
    expect(result.content[0].text).toContain('CAEaAggD');
  });

  it('never sends startAt — the endpoint ignores it, which silently broke paging', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ issues: [], isLast: true }),
      headers: new Headers(),
    });

    const tools = createSearchTools(new JiraClient(testConfig));
    await tools.jira_search.handler({ jql: 'project = PROJ' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).not.toContain('startAt');
  });

  it('forwards a supplied nextPageToken to the API', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ issues: [], isLast: true }),
      headers: new Headers(),
    });

    const tools = createSearchTools(new JiraClient(testConfig));
    await tools.jira_search.handler({ jql: 'project = PROJ', nextPageToken: 'TOKEN123' });

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain('nextPageToken=TOKEN123');
  });

  it('fetches an approximate count only when includeTotal is set', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            issues: [
              {
                key: 'PROJ-1',
                id: '1',
                fields: { summary: 'First', status: { name: 'Open' }, assignee: null },
              },
            ],
          }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ count: 417 }),
        headers: new Headers(),
      });
    global.fetch = fetchMock;

    const tools = createSearchTools(new JiraClient(testConfig));
    const result = await tools.jira_search.handler({
      jql: 'project = PROJ',
      includeTotal: true,
    });

    expect(fetchMock.mock.calls[1][0]).toContain('/rest/api/3/search/approximate-count');
    expect(result.content[0].text).toContain('~417');
  });

  it('flags an empty page that contradicts a non-zero count', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ issues: [] }),
        headers: new Headers(),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ count: 12 }),
        headers: new Headers(),
      });

    const tools = createSearchTools(new JiraClient(testConfig));
    const result = await tools.jira_search.handler({
      jql: 'project = PROJ',
      includeTotal: true,
    });
    expect(result.content[0].text).toMatch(/permissions or scope problem/);
  });
});
