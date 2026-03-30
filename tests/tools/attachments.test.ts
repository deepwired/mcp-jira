import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createAttachmentTools } from '../../src/tools/attachments.js';
import type { JiraConfig } from '../../src/types.js';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from('file contents')),
}));

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

describe('jira_list_attachments', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns formatted attachment list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          key: 'PROJ-1',
          id: '10001',
          fields: {
            attachment: [
              {
                id: '10101',
                filename: 'screenshot.png',
                author: { displayName: 'Alice', accountId: 'acc1' },
                created: '2024-01-01T00:00:00.000Z',
                size: 204800,
                mimeType: 'image/png',
                content: 'https://example.atlassian.net/rest/api/3/attachment/content/10101',
              },
            ],
          },
        }),
      headers: new Headers(),
    });

    const tools = createAttachmentTools(makeClient());
    const result = await tools.jira_list_attachments.handler({ issueKey: 'PROJ-1' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('screenshot.png');
    expect(result.content[0].text).toContain('10101');
    expect(result.content[0].text).toContain('Alice');
    expect(result.content[0].text).toContain('image/png');
  });

  it('returns empty message when no attachments', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          key: 'PROJ-1',
          id: '10001',
          fields: { attachment: [] },
        }),
      headers: new Headers(),
    });

    const tools = createAttachmentTools(makeClient());
    const result = await tools.jira_list_attachments.handler({ issueKey: 'PROJ-1' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('No attachments');
  });

  it('requires issueKey', async () => {
    const tools = createAttachmentTools(makeClient());
    await expect(tools.jira_list_attachments.handler({ issueKey: '' })).rejects.toThrow();
  });
});

describe('jira_add_attachment', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uploads file and returns success with attachment name', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve([{ id: '10202', filename: 'report.pdf' }]),
      headers: new Headers(),
    });

    const tools = createAttachmentTools(makeClient());
    const result = await tools.jira_add_attachment.handler({
      issueKey: 'PROJ-2',
      filePath: '/tmp/report.pdf',
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('report.pdf');
    expect(result.content[0].text).toContain('PROJ-2');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/attachments');
    expect(call[1].headers['X-Atlassian-Token']).toBe('no-check');
    expect(call[1].headers['Content-Type']).toBeUndefined();
  });

  it('returns error when file cannot be read', async () => {
    const { readFile } = await import('node:fs/promises');
    vi.mocked(readFile).mockRejectedValueOnce(new Error('ENOENT: no such file'));

    const tools = createAttachmentTools(makeClient());
    const result = await tools.jira_add_attachment.handler({
      issueKey: 'PROJ-2',
      filePath: '/nonexistent/file.txt',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('ENOENT');
  });

  it('requires issueKey', async () => {
    const tools = createAttachmentTools(makeClient());
    await expect(
      tools.jira_add_attachment.handler({ issueKey: '', filePath: '/tmp/file.txt' }),
    ).rejects.toThrow();
  });
});

describe('jira_delete_attachment', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('blocks deletion without confirm: true', async () => {
    const tools = createAttachmentTools(makeClient());
    const result = await tools.jira_delete_attachment.handler({
      attachmentId: '10101',
      confirm: false,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/confirm.*true/i);
  });

  it('deletes attachment with confirm: true', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers({ 'content-length': '0' }),
    });

    const tools = createAttachmentTools(makeClient());
    const result = await tools.jira_delete_attachment.handler({
      attachmentId: '10101',
      confirm: true,
    });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('deleted');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain('/attachment/10101');
    expect(call[1].method).toBe('DELETE');
  });
});
