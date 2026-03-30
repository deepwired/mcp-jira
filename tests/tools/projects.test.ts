import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createProjectTools } from '../../src/tools/projects.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:jira-work'],
};

describe('jira_list_projects', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns formatted project list', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          startAt: 0,
          maxResults: 20,
          total: 2,
          values: [
            {
              id: '1',
              key: 'PROJ',
              name: 'Project One',
              projectTypeKey: 'software',
              style: 'next-gen',
            },
            {
              id: '2',
              key: 'TEAM',
              name: 'Team Project',
              projectTypeKey: 'software',
              style: 'classic',
            },
          ],
        }),
      headers: new Headers(),
    });

    const tools = createProjectTools(new JiraClient(testConfig));
    const result = await tools.jira_list_projects.handler({});
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('PROJ');
    expect(result.content[0].text).toContain('TEAM');
    expect(result.content[0].text).toContain('2 project(s)');
  });
});

describe('jira_get_project', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('returns project details', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: '1',
          key: 'PROJ',
          name: 'Project One',
          projectTypeKey: 'software',
          style: 'next-gen',
        }),
      headers: new Headers(),
    });

    const tools = createProjectTools(new JiraClient(testConfig));
    const result = await tools.jira_get_project.handler({ projectKey: 'PROJ' });
    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain('PROJ');
    expect(result.content[0].text).toContain('Project One');
    expect(result.content[0].text).toContain('software');
  });

  it('requires projectKey', async () => {
    const tools = createProjectTools(new JiraClient(testConfig));
    await expect(tools.jira_get_project.handler({ projectKey: '' })).rejects.toThrow();
  });
});
