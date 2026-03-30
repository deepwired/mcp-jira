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

  it('shows pagination hint when more results available', async () => {
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
          isLast: false,
        }),
      headers: new Headers(),
    });

    const tools = createSearchTools(new JiraClient(testConfig));
    const result = await tools.jira_search.handler({ jql: 'project = PROJ' });
    expect(result.content[0].text).toContain('more results available');
  });
});
