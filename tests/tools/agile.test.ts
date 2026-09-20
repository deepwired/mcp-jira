import { describe, it, expect, vi, afterEach } from 'vitest';
import { JiraClient } from '../../src/client.js';
import { createAgileTools } from '../../src/tools/agile.js';
import type { JiraConfig } from '../../src/types.js';

const testConfig: JiraConfig = {
  instance: 'test',
  cloudId: 'test-cloud-id',
  apiToken: 'tok',
  userEmail: 'a@b.com',
  scopes: ['read:board-scope:jira-software', 'read:project:jira', 'write:sprint:jira-software'],
};

function tools() {
  return createAgileTools(new JiraClient(testConfig));
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

describe('jira_list_boards', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists boards with id, type and project', async () => {
    mockJson({
      total: 1,
      isLast: true,
      values: [
        { id: 42, name: 'TRAP Scrum', type: 'scrum', location: { projectKey: 'TRAP' } },
      ],
    });
    const res = await tools().jira_list_boards.handler({});
    expect(res.content[0].text).toContain('TRAP Scrum');
    expect(res.content[0].text).toContain('id: 42');
  });

  it('names the two scopes needed when the list comes back empty', async () => {
    // An empty board list is the symptom of a missing read:project:jira, which
    // is the single most common agile setup mistake.
    mockJson({ total: 0, isLast: true, values: [] });
    const res = await tools().jira_list_boards.handler({});
    expect(res.content[0].text).toContain('read:board-scope:jira-software');
    expect(res.content[0].text).toContain('read:project:jira');
  });

  it('passes a project filter through', async () => {
    const fetchMock = mockJson({ values: [], isLast: true, total: 0 });
    await tools().jira_list_boards.handler({ projectKeyOrId: 'TRAP' });
    expect(fetchMock.mock.calls[0][0]).toContain('projectKeyOrId=TRAP');
  });
});

describe('jira_list_sprints', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('lists sprints with state, dates and goal', async () => {
    mockJson({
      isLast: true,
      values: [
        {
          id: 7,
          name: 'Sprint 12',
          state: 'active',
          startDate: '2026-09-01T00:00:00.000Z',
          endDate: '2026-09-14T00:00:00.000Z',
          goal: 'Ship the migration',
        },
      ],
    });
    const res = await tools().jira_list_sprints.handler({ boardId: 42 });
    expect(res.content[0].text).toContain('Sprint 12');
    expect(res.content[0].text).toContain('2026-09-01 → 2026-09-14');
    expect(res.content[0].text).toContain('Ship the migration');
  });

  it('filters by state', async () => {
    const fetchMock = mockJson({ values: [], isLast: true });
    await tools().jira_list_sprints.handler({ boardId: 42, state: 'active' });
    expect(fetchMock.mock.calls[0][0]).toContain('state=active');
  });
});

describe('jira_get_sprint_issues', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('uses /rest/software/1.0, not the deprecated agile route', async () => {
    const fetchMock = mockJson({ total: 0, issues: [] });
    await tools().jira_get_sprint_issues.handler({ sprintId: 7 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/rest/software/1.0/sprint/7/issue');
    expect(url).not.toContain('/rest/agile/1.0/sprint');
  });

  it('summarises issues with status and assignee', async () => {
    mockJson({
      total: 1,
      issues: [
        {
          key: 'TRAP-1',
          id: '1',
          fields: {
            summary: 'Do the thing',
            status: { name: 'In Progress' },
            assignee: { displayName: 'Alice' },
          },
        },
      ],
    });
    const res = await tools().jira_get_sprint_issues.handler({ sprintId: 7 });
    expect(res.content[0].text).toContain('TRAP-1');
    expect(res.content[0].text).toContain('In Progress');
    expect(res.content[0].text).toContain('Alice');
  });
});

describe('jira_manage_sprint', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('creates a sprint with originBoardId', async () => {
    const fetchMock = mockJson({ id: 9 }, 201);
    const res = await tools().jira_manage_sprint.handler({
      action: 'create',
      boardId: 42,
      name: 'Sprint 13',
      goal: 'Finish it',
    });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.originBoardId).toBe(42);
    expect(body.name).toBe('Sprint 13');
    expect(res.content[0].text).toContain('id: 9');
  });

  it('requires boardId and name to create', async () => {
    const a = await tools().jira_manage_sprint.handler({ action: 'create', name: 'x' });
    expect(a.isError).toBe(true);
    const b = await tools().jira_manage_sprint.handler({ action: 'create', boardId: 42 });
    expect(b.isError).toBe(true);
  });

  it('starts a sprint by setting state active', async () => {
    const fetchMock = mockJson({}, 200);
    await tools().jira_manage_sprint.handler({
      action: 'update',
      sprintId: 7,
      state: 'active',
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).state).toBe('active');
  });

  it('refuses a no-op update', async () => {
    const res = await tools().jira_manage_sprint.handler({ action: 'update', sprintId: 7 });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain('No changes supplied');
  });

  it('moves issues into a sprint', async () => {
    const fetchMock = mockJson({}, 204);
    const res = await tools().jira_manage_sprint.handler({
      action: 'add_issues',
      sprintId: 7,
      issueKeys: ['TRAP-1', 'TRAP-2'],
    });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).issues).toEqual(['TRAP-1', 'TRAP-2']);
    expect(res.content[0].text).toContain('2 issue(s)');
  });

  it('refuses add_issues with an empty list', async () => {
    const res = await tools().jira_manage_sprint.handler({
      action: 'add_issues',
      sprintId: 7,
      issueKeys: [],
    });
    expect(res.isError).toBe(true);
  });
});
