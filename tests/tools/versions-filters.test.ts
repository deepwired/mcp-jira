import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createVersionTools } from '../../src/tools/versions.js';
import { createFilterTools } from '../../src/tools/filters.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work', 'manage:jira-project'],
};

function versions() {
  return createVersionTools(new JiraClient(testConfig));
}
function filters() {
  return createFilterTools(new JiraClient(testConfig));
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

describe('jira_list_versions', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  const PAYLOAD = {
    total: 2,
    values: [
      { id: '1', name: '1.0.0', released: true, releaseDate: '2026-01-01' },
      { id: '2', name: '2.0.0', released: false },
    ],
  };

  it('uses the per-project route, since /rest/api/3/version does not exist', async () => {
    const fetchMock = mockJson(PAYLOAD);
    await versions().jira_list_versions.handler({ projectKey: 'TRAP' });
    expect(fetchMock.mock.calls[0][0]).toContain('/rest/api/3/project/TRAP/version');
  });

  it('filters to unreleased on request', async () => {
    mockJson(PAYLOAD);
    const res = await versions().jira_list_versions.handler({
      projectKey: 'TRAP',
      released: 'unreleased',
    });
    expect(res.content[0].text).toContain('2.0.0');
    expect(res.content[0].text).not.toContain('1.0.0');
  });
});

describe('jira_manage_version', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a version against the project', async () => {
    const fetchMock = mockJson({ id: '3' }, 201);
    await versions().jira_manage_version.handler({
      action: 'create',
      projectKey: 'TRAP',
      name: '3.0.0',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ name: '3.0.0', project: 'TRAP' });
  });

  it('requires projectKey and name to create', async () => {
    const res = await versions().jira_manage_version.handler({ action: 'create', name: 'x' });
    expect(res.isError).toBe(true);
  });

  it('release defaults releaseDate to today', async () => {
    const fetchMock = mockJson({}, 200);
    await versions().jira_manage_version.handler({ action: 'release', versionId: '2' });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.released).toBe(true);
    expect(body.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('requires versionId for update and release', async () => {
    const res = await versions().jira_manage_version.handler({ action: 'release' });
    expect(res.isError).toBe(true);
  });
});

describe('jira_list_components', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists components with leads', async () => {
    mockJson([{ id: '1', name: 'api', lead: { displayName: 'Alice' } }]);
    const res = await versions().jira_list_components.handler({ projectKey: 'TRAP' });
    expect(res.content[0].text).toContain('api');
    expect(res.content[0].text).toContain('Alice');
  });

  it('handles a project with none', async () => {
    mockJson([]);
    const res = await versions().jira_list_components.handler({ projectKey: 'TRAP' });
    expect(res.content[0].text).toContain('No components');
  });
});

describe('jira_list_filters', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('defaults to /filter/my, since /rest/api/3/filter was removed', async () => {
    const fetchMock = mockJson([{ id: '1', name: 'My open bugs', jql: 'assignee = currentUser()' }]);
    const res = await filters().jira_list_filters.handler({});
    expect(fetchMock.mock.calls[0][0]).toContain('/rest/api/3/filter/my');
    expect(res.content[0].text).toContain('My open bugs');
    expect(res.content[0].text).toContain('assignee = currentUser()');
  });

  it('uses /filter/search for scope "all"', async () => {
    const fetchMock = mockJson({ total: 0, values: [] });
    await filters().jira_list_filters.handler({ scope: 'all', query: 'release' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/rest/api/3/filter/search');
    expect(url).toContain('filterName=release');
  });
});

describe('jira_get_filter', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns the JQL in a fenced block ready to pass to jira_search', async () => {
    mockJson({ id: '1', name: 'Escalations', jql: 'priority = Highest', owner: { displayName: 'Bob' } });
    const res = await filters().jira_get_filter.handler({ filterId: '1' });
    expect(res.content[0].text).toContain('priority = Highest');
    expect(res.content[0].text).toContain('```');
  });
});

describe('jira_list_labels', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists labels and flags more pages', async () => {
    mockJson({ total: 3, isLast: false, values: ['alpha', 'beta', 'gamma'] });
    const res = await filters().jira_list_labels.handler({});
    expect(res.content[0].text).toContain('alpha');
    expect(res.content[0].text).toContain('more available');
  });

  it('substring filter says it only applies to the current page', async () => {
    // Jira has no server-side label search, so this is a client-side filter and
    // saying otherwise would mislead about completeness.
    mockJson({ total: 3, isLast: false, values: ['alpha', 'beta'] });
    const res = await filters().jira_list_labels.handler({ contains: 'zzz' });
    expect(res.content[0].text).toContain('current page only');
  });

  it('applies the substring filter case-insensitively', async () => {
    mockJson({ total: 2, isLast: true, values: ['Alpha', 'beta'] });
    const res = await filters().jira_list_labels.handler({ contains: 'ALP' });
    expect(res.content[0].text).toContain('Alpha');
    expect(res.content[0].text).not.toContain('beta');
  });
});
