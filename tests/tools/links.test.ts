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
