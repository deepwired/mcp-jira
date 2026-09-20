import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createLinkTools } from '../../src/tools/links.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work', 'write:jira-work'],
};

describe('jira_link_issues', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a link between two issues', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-length': '0' }),
    });

    const tools = createLinkTools(new JiraClient(testConfig));
    const result = await tools.jira_link_issues.handler({
      linkType: 'Blocks',
      inwardIssueKey: 'PROJ-1',
      outwardIssueKey: 'PROJ-2',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('PROJ-1');
    expect(result.content[0].text).toContain('PROJ-2');
    expect(result.content[0].text).toContain('Blocks');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.type.name).toBe('Blocks');
    expect(body.inwardIssue.key).toBe('PROJ-1');
    expect(body.outwardIssue.key).toBe('PROJ-2');
  });

  it('requires linkType', async () => {
    const tools = createLinkTools(new JiraClient(testConfig));
    await expect(
      tools.jira_link_issues.handler({
        linkType: '',
        inwardIssueKey: 'A-1',
        outwardIssueKey: 'B-1',
      }),
    ).rejects.toThrow();
  });
});

describe('jira_list_link_types', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns formatted link types', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          issueLinkTypes: [
            { id: '1', name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
            { id: '2', name: 'Relates', inward: 'relates to', outward: 'relates to' },
          ],
        }),
      headers: new Headers(),
    });

    const tools = createLinkTools(new JiraClient(testConfig));
    const result = await tools.jira_list_link_types.handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('Blocks');
    expect(result.content[0].text).toContain('Relates');
    expect(result.content[0].text).toContain('is blocked by');
  });
});

describe('remote links', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

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

  function tools() {
    return createLinkTools(new JiraClient(testConfig));
  }

  it('lists remote links with url, title and id', async () => {
    mockJson([
      {
        id: 10001,
        relationship: 'documented by',
        object: { url: 'https://wiki/x', title: 'Design doc', summary: 'the design' },
      },
    ]);
    const res = await tools().jira_list_remote_links.handler({ issueKey: 'PROJ-1' });
    expect(res.content[0].text).toContain('Design doc');
    expect(res.content[0].text).toContain('https://wiki/x');
    expect(res.content[0].text).toContain('documented by');
  });

  it('reports no remote links plainly', async () => {
    mockJson([]);
    const res = await tools().jira_list_remote_links.handler({ issueKey: 'PROJ-1' });
    expect(res.content[0].text).toContain('No remote links');
  });

  it('creates a remote link with the nested object shape Jira expects', async () => {
    const fetchMock = mockJson({ id: 10002 }, 201);
    await tools().jira_create_remote_link.handler({
      issueKey: 'PROJ-1',
      url: 'https://example.com/pr/1',
      title: 'PR #1',
      relationship: 'implemented by',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.object.url).toBe('https://example.com/pr/1');
    expect(body.object.title).toBe('PR #1');
    expect(body.relationship).toBe('implemented by');
  });

  it('rejects a non-URL', async () => {
    await expect(
      tools().jira_create_remote_link.handler({
        issueKey: 'PROJ-1',
        url: 'not-a-url',
        title: 'x',
      }),
    ).rejects.toThrow();
  });

  it('remote link deletion needs confirm: true', async () => {
    const res = await tools().jira_delete_remote_link.handler({
      issueKey: 'PROJ-1',
      linkId: '10001',
      confirm: false,
    });
    expect(res.isError).toBe(true);
  });

  it('issue link removal needs confirm: true', async () => {
    const res = await tools().jira_remove_link.handler({ linkId: '999', confirm: false });
    expect(res.isError).toBe(true);
  });
});
