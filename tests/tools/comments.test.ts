import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createCommentTools, plainTextToAdf } from '../../src/tools/comments.js';
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
  afterEach(() => {
    global.fetch = originalFetch;
  });

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

describe('plainTextToAdf — link support', () => {
  it('converts plain text without links unchanged', () => {
    const adf = plainTextToAdf('Just some text');
    const nodes = adf.content[0].content;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({ type: 'text', text: 'Just some text' });
  });

  it('auto-links bare URLs', () => {
    const adf = plainTextToAdf('PR: https://github.com/org/repo/pull/42 please review');
    const nodes = adf.content[0].content;
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: 'text', text: 'PR: ' });
    expect(nodes[1]).toEqual({
      type: 'text',
      text: 'https://github.com/org/repo/pull/42',
      marks: [{ type: 'link', attrs: { href: 'https://github.com/org/repo/pull/42' } }],
    });
    expect(nodes[2]).toEqual({ type: 'text', text: ' please review' });
  });

  it('parses Jira wiki-style [label|url] links', () => {
    const adf = plainTextToAdf('See [PR #42|https://github.com/org/repo/pull/42] for details');
    const nodes = adf.content[0].content;
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: 'text', text: 'See ' });
    expect(nodes[1]).toEqual({
      type: 'text',
      text: 'PR #42',
      marks: [{ type: 'link', attrs: { href: 'https://github.com/org/repo/pull/42' } }],
    });
    expect(nodes[2]).toEqual({ type: 'text', text: ' for details' });
  });

  it('handles mixed wiki links and bare URLs', () => {
    const adf = plainTextToAdf(
      '[Docs|https://docs.example.com] and also https://jira.example.com/browse/X-1',
    );
    const nodes = adf.content[0].content;
    expect(nodes[0]).toEqual({
      type: 'text',
      text: 'Docs',
      marks: [{ type: 'link', attrs: { href: 'https://docs.example.com' } }],
    });
    expect(nodes[1]).toEqual({ type: 'text', text: ' and also ' });
    expect(nodes[2]).toEqual({
      type: 'text',
      text: 'https://jira.example.com/browse/X-1',
      marks: [{ type: 'link', attrs: { href: 'https://jira.example.com/browse/X-1' } }],
    });
  });

  it('handles multiple lines as separate paragraphs', () => {
    const adf = plainTextToAdf('Line one\nLine two');
    expect(adf.content).toHaveLength(2);
    expect(adf.content[0].content[0].text).toBe('Line one');
    expect(adf.content[1].content[0].text).toBe('Line two');
  });

  it('handles URL at start of text', () => {
    const adf = plainTextToAdf('https://example.com is the site');
    const nodes = adf.content[0].content;
    expect(nodes[0]).toEqual({
      type: 'text',
      text: 'https://example.com',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    });
    expect(nodes[1]).toEqual({ type: 'text', text: ' is the site' });
  });

  it('handles URL at end of text', () => {
    const adf = plainTextToAdf('Visit https://example.com');
    const nodes = adf.content[0].content;
    expect(nodes[0]).toEqual({ type: 'text', text: 'Visit ' });
    expect(nodes[1]).toEqual({
      type: 'text',
      text: 'https://example.com',
      marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
    });
  });
});

describe('jira_update_comment', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('calls PUT with ADF body and returns success', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: '10042',
          author: { displayName: 'Test', accountId: '123' },
          body: { type: 'doc', version: 1, content: [] },
          created: '2024-01-01',
          updated: '2024-01-02',
        }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    const result = await tools.jira_update_comment.handler({
      issueKey: 'PROJ-1',
      commentId: '10042',
      body: 'Updated comment',
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('10042');
    expect(result.content[0].text).toContain('PROJ-1');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/comment/10042');
    expect(call[1].method).toBe('PUT');
    const body = JSON.parse(call[1].body);
    expect(body.body.type).toBe('doc');
  });

  it('converts links in updated comment body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: '10042',
          author: { displayName: 'Test', accountId: '123' },
          body: { type: 'doc', version: 1, content: [] },
          created: '2024-01-01',
          updated: '2024-01-02',
        }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    await tools.jira_update_comment.handler({
      issueKey: 'PROJ-1',
      commentId: '10042',
      body: 'See https://example.com for details',
    });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    const nodes = body.body.content[0].content;
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: 'text', text: 'See ' });
    expect(nodes[1].marks[0].attrs.href).toBe('https://example.com');
    expect(nodes[2]).toEqual({ type: 'text', text: ' for details' });
  });

  it('returns error on API failure', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ errorMessages: ['Comment not found'] }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    const result = await tools.jira_update_comment.handler({
      issueKey: 'PROJ-1',
      commentId: '99999',
      body: 'Updated',
    });

    expect(result.isError).toBe(true);
  });

  it('rejects empty commentId', async () => {
    const tools = createCommentTools(new JiraClient(testConfig));
    await expect(
      tools.jira_update_comment.handler({ issueKey: 'PROJ-1', commentId: '', body: 'text' }),
    ).rejects.toThrow();
  });
});

describe('jira_list_comments', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

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
              body: {
                type: 'doc',
                version: 1,
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Great work!' }] }],
              },
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

  it('preserves named links as [label|url] wiki markup', async () => {
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
              body: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'See ' },
                      {
                        type: 'text',
                        text: 'PR #42',
                        marks: [
                          {
                            type: 'link',
                            attrs: { href: 'https://github.com/org/repo/pull/42' },
                          },
                        ],
                      },
                      { type: 'text', text: ' for details' },
                    ],
                  },
                ],
              },
              created: '2024-01-01',
              updated: '2024-01-01',
            },
          ],
        }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    const result = await tools.jira_list_comments.handler({ issueKey: 'PROJ-1' });
    expect(result.content[0].text).toContain(
      'See [PR #42|https://github.com/org/repo/pull/42] for details',
    );
  });

  it('preserves bare URL links without wiki markup wrapper', async () => {
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
              author: { displayName: 'Bob', accountId: '2' },
              body: {
                type: 'doc',
                version: 1,
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'Link: ' },
                      {
                        type: 'text',
                        text: 'https://example.com',
                        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
                      },
                    ],
                  },
                ],
              },
              created: '2024-01-01',
              updated: '2024-01-01',
            },
          ],
        }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    const result = await tools.jira_list_comments.handler({ issueKey: 'PROJ-1' });
    // Bare URL where text === href should NOT be wrapped in [|] markup
    expect(result.content[0].text).toContain('Link: https://example.com');
    expect(result.content[0].text).not.toContain('[https://example.com|');
  });

  it('preserves newlines between multiple ADF paragraphs', async () => {
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
              body: {
                type: 'doc',
                version: 1,
                content: [
                  { type: 'paragraph', content: [{ type: 'text', text: 'Line one' }] },
                  { type: 'paragraph', content: [{ type: 'text', text: 'Line two' }] },
                  {
                    type: 'paragraph',
                    content: [
                      { type: 'text', text: 'See ' },
                      {
                        type: 'text',
                        text: 'link',
                        marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
                      },
                    ],
                  },
                ],
              },
              created: '2024-01-01',
              updated: '2024-01-01',
            },
          ],
        }),
      headers: new Headers(),
    });

    const tools = createCommentTools(new JiraClient(testConfig));
    const result = await tools.jira_list_comments.handler({ issueKey: 'PROJ-1' });
    const text = result.content[0].text;
    expect(text).toContain('Line one\nLine two\nSee [link|https://example.com]');
  });
});
