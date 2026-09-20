import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JiraClient } from '../src/client.js';
import type { JiraConfig } from '../src/types.js';

const testConfig: JiraConfig = {
  instance: 'testcompany',
  cloudId: 'test-cloud-id-123',
  apiToken: 'test-token-123',
  userEmail: 'test@test.com',
  scopes: ['read:jira-work'],
};

describe('JiraClient', () => {
  let client: JiraClient;
  const originalFetch = global.fetch;

  beforeEach(() => {
    client = new JiraClient(testConfig);
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('1. successful GET returns parsed JSON', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ key: 'PROJ-1', fields: { summary: 'Test' } }),
      headers: new Headers(),
    });

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ key: 'PROJ-1', fields: { summary: 'Test' } });
  });

  it('2. GET 404 returns clean error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Headers(),
    });

    const res = await client.get('/rest/api/3/issue/NOPE-999');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(404);
    expect(res.error).toMatch(/Not found/i);
  });

  it('3. GET 401 returns auth error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      headers: new Headers(),
    });

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(res.error).toMatch(/Authentication failed/);
  });

  it('4. GET 403 returns permission error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: new Headers(),
    });

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(403);
    expect(res.error).toMatch(/Permission denied/);
  });

  it('5. GET 429 returns rate limit error with retry-after', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '30' }),
    });

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.error).toMatch(/Rate limited/);
    expect(res.retryAfter).toBe(30);
  });

  it('6. network timeout returns clean error', async () => {
    const timeoutError = new DOMException('The operation was aborted', 'TimeoutError');
    global.fetch = vi.fn().mockRejectedValue(timeoutError);

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/timed out/);
  });

  it('7. malformed JSON response returns clean error', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.reject(new SyntaxError('Unexpected token')),
      headers: new Headers(),
    });

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/Invalid JSON/);
  });

  it('handles 204 No Content', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      headers: new Headers(),
    });

    const res = await client.delete('/rest/api/3/issue/PROJ-1');
    expect(res.ok).toBe(true);
    expect(res.status).toBe(204);
  });

  it('handles 201 with empty body (e.g. issue link creation)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Headers({ 'content-length': '0' }),
    });

    const res = await client.post('/rest/api/3/issueLink', { type: { name: 'Blocks' } });
    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
  });

  it('sends correct headers with Basic auth via api.atlassian.com', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      headers: new Headers(),
    });

    await client.get('/rest/api/3/myself');

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe('https://api.atlassian.com/ex/jira/test-cloud-id-123/rest/api/3/myself');
    const expectedBasic = Buffer.from('test@test.com:test-token-123').toString('base64');
    expect(call[1].headers.Authorization).toBe(`Basic ${expectedBasic}`);
  });

  it('POST sends JSON body', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: '1', key: 'PROJ-1' }),
      headers: new Headers(),
    });

    await client.post('/rest/api/3/issue', { fields: { summary: 'Test' } });

    const call = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body)).toEqual({ fields: { summary: 'Test' } });
  });

  it('does not leak token in error messages', async () => {
    const err = new TypeError(`fetch failed at https://x.com with token test-token-123`);
    global.fetch = vi.fn().mockRejectedValue(err);

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.error).not.toContain('test-token-123');
  });

  it('sanitizes token in generic error messages', async () => {
    const err = new Error(`Connection failed with token test-token-123 attached`);
    global.fetch = vi.fn().mockRejectedValue(err);

    const res = await client.get('/rest/api/3/issue/PROJ-1');
    expect(res.error).not.toContain('test-token-123');
    expect(res.error).toContain('[REDACTED]');
  });
});

describe('JiraClient error decoder', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  function respondWith(status: number) {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status,
      json: () => Promise.resolve({}),
      headers: new Headers(),
    });
  }

  it('401 names both causes: missing scope and wrong cloudId', async () => {
    respondWith(401);
    const res = await new JiraClient(testConfig).get('/rest/api/3/issue/PROJ-1');
    expect(res.error).toMatch(/scope/i);
    expect(res.error).toMatch(/Cloud ID/i);
  });

  it('403 states the scope check passed, so users stop hunting scopes', async () => {
    respondWith(403);
    const res = await new JiraClient(testConfig).get('/rest/api/3/issue/PROJ-1');
    expect(res.error).toMatch(/scope check passed/i);
    expect(res.error).toMatch(/licence|permission/i);
  });

  it('404 points at the gateway base URL, the most common real cause', async () => {
    respondWith(404);
    const res = await new JiraClient(testConfig).get('/rest/api/3/issue/PROJ-1');
    expect(res.error).toContain('api.atlassian.com/ex/jira');
  });

  it('sends a body on DELETE when one is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: () => Promise.resolve({}),
      headers: new Headers({ 'content-length': '0' }),
    });
    global.fetch = fetchMock;

    await new JiraClient(testConfig).delete('/rest/api/3/thing/1', { reason: 'cleanup' });
    expect(fetchMock.mock.calls[0][1].body).toBe(JSON.stringify({ reason: 'cleanup' }));
  });
});
