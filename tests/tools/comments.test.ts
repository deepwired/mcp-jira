import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createCommentTools } from '../../src/tools/comments.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work', 'write:jira-work'],
};

describe('jira_add_comment', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('8. converts plain text to ADF and calls POST', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: '10042',
          author: { displayName: 'Test', accountId: '123' },
          body: { type: 'doc', version: 1, content: [] },
          created: '2024-01-01',
          updated: '2024-01-01',
        }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    const result = await tools.jira_add_comment.handler({
      issueKey: 'PROJ-1',
      body: 'Hello from MCP',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('10042');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.body.type).toBe('doc');
    expect(body.body.content[0].content[0].text).toBe('Hello from MCP');
  });

  it('9. empty body throws validation error', async () => {
    const tools = createCommentTools(new JiraClient(testConfig));
    await expect(
      tools.jira_add_comment.handler({ issueKey: 'PROJ-1', body: '' }),
    ).rejects.toThrow();
  });
});

describe('jira_list_comments', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('returns formatted comments', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          startAt: 0,
          maxResults: 20,
          total: 1,
          comments: [
            {
              id: '100',
              author: { displayName: 'Alice', accountId: '1' },
              body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Great work!' }] }] },
              created: '2024-01-01',
              updated: '2024-01-01',
            },
          ],
        }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    const result = await tools.jira_list_comments.handler({ issueKey: 'PROJ-1' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Alice');
    expect(result.content[0].text).toContain('Great work!');
  });
});
