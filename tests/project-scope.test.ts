import { describe, it, expect } from 'vitest';
import { ProjectScope, parseProjects } from '../src/project-scope.js';
import { applyProjectScope } from '../src/index.js';

describe('parseProjects', () => {
  it('returns null when unset or empty, meaning unrestricted', () => {
    expect(parseProjects(undefined)).toBeNull();
    expect(parseProjects('')).toBeNull();
    expect(parseProjects('  ,  ')).toBeNull();
  });

  it('uppercases and trims', () => {
    expect(parseProjects(' proj , ops ')).toEqual(['PROJ', 'OPS']);
  });

  it('rejects things that are not project keys', () => {
    expect(() => parseProjects('PROJ,my project')).toThrow(/MY PROJECT/i);
    expect(() => parseProjects('123')).toThrow();
  });
});

describe('ProjectScope', () => {
  const scope = new ProjectScope(['PROJ', 'OPS']);
  const open = new ProjectScope(null);

  it('is inactive with no allowlist and permits everything', () => {
    expect(open.isActive).toBe(false);
    expect(open.allows('ANYTHING')).toBe(true);
    expect(() => open.assertIssueKey('X-1')).not.toThrow();
  });

  it('allows listed projects and refuses others', () => {
    expect(scope.allows('PROJ')).toBe(true);
    expect(scope.allows('proj')).toBe(true);
    expect(scope.allows('OTHER')).toBe(false);
  });

  it('derives the project from an issue key', () => {
    expect(ProjectScope.projectOf('PROJ-5466')).toBe('PROJ');
    expect(ProjectScope.projectOf('ops-1')).toBe('OPS');
    expect(ProjectScope.projectOf('12345')).toBeNull();
  });

  it('refuses an issue key outside the allowlist, naming what is allowed', () => {
    expect(() => scope.assertIssueKey('OTHER-7708')).toThrow(/not in JIRA_PROJECTS/);
    expect(() => scope.assertIssueKey('OTHER-7708')).toThrow(/PROJ, OPS/);
  });

  it('refuses a bare numeric issue id, which cannot be checked', () => {
    // A numeric ID carries no project, so silently allowing it would be a hole.
    expect(() => scope.assertIssueKey('1240197')).toThrow(/project-qualified issue key/);
  });

  it('accepts an allowed issue key', () => {
    expect(() => scope.assertIssueKey('PROJ-5466')).not.toThrow();
  });
});

describe('ProjectScope.constrainJql', () => {
  const scope = new ProjectScope(['PROJ', 'OPS']);

  it('wraps a plain query', () => {
    expect(scope.constrainJql('status = Done')).toBe(
      'project in (PROJ, OPS) AND (status = Done)',
    );
  });

  it('keeps ORDER BY at the end, where JQL requires it', () => {
    expect(scope.constrainJql('status = Done ORDER BY created DESC')).toBe(
      'project in (PROJ, OPS) AND (status = Done) ORDER BY created DESC',
    );
  });

  it('handles a query that is only an ORDER BY', () => {
    expect(scope.constrainJql('ORDER BY created DESC')).toBe(
      'project in (PROJ, OPS) ORDER BY created DESC',
    );
  });

  it('handles an empty query', () => {
    expect(scope.constrainJql('')).toBe('project in (PROJ, OPS)');
  });

  it('parenthesises the original so OR cannot escape the restriction', () => {
    // Without the parentheses this would match every issue in the site.
    const out = scope.constrainJql('project = OTHER OR status = Done');
    expect(out).toBe('project in (PROJ, OPS) AND (project = OTHER OR status = Done)');
  });

  it('is a no-op when inactive', () => {
    expect(new ProjectScope(null).constrainJql('status = Done')).toBe('status = Done');
  });
});

describe('applyProjectScope', () => {
  const scope = new ProjectScope(['PROJ']);

  it('passes arguments through untouched when inactive', () => {
    const args = { issueKey: 'OTHER-1', jql: 'status = Done' };
    expect(applyProjectScope(new ProjectScope(null), args)).toEqual(args);
  });

  it('refuses a disallowed issueKey', () => {
    expect(() => applyProjectScope(scope, { issueKey: 'OTHER-1' })).toThrow(/not in JIRA_PROJECTS/);
  });

  it('refuses a disallowed projectKey', () => {
    expect(() => applyProjectScope(scope, { projectKey: 'OTHER' })).toThrow();
  });

  it('checks both ends of an issue link', () => {
    expect(() =>
      applyProjectScope(scope, { inwardIssueKey: 'PROJ-1', outwardIssueKey: 'OTHER-2' }),
    ).toThrow(/OTHER/);
  });

  it('checks every key in an issueKeys array', () => {
    expect(() =>
      applyProjectScope(scope, { issueKeys: ['PROJ-1', 'OTHER-2'] }),
    ).toThrow(/OTHER/);
  });

  it('constrains jql in place', () => {
    const out = applyProjectScope(scope, { jql: 'status = Done' });
    expect(out.jql).toBe('project in (PROJ) AND (status = Done)');
  });

  it('does not mutate the caller\'s object', () => {
    const args = { jql: 'status = Done' };
    applyProjectScope(scope, args);
    expect(args.jql).toBe('status = Done');
  });

  it('leaves unrelated arguments alone', () => {
    const out = applyProjectScope(scope, { issueKey: 'PROJ-1', maxResults: 10, format: 'text' });
    expect(out.maxResults).toBe(10);
    expect(out.format).toBe('text');
  });
});

describe('constrainJql ORDER BY edge cases', () => {
  const scope = new ProjectScope(['PROJ']);

  it('takes the last ORDER BY, not one inside a quoted literal', () => {
    expect(scope.constrainJql('summary ~ "ORDER BY" ORDER BY created DESC')).toBe(
      'project in (PROJ) AND (summary ~ "ORDER BY") ORDER BY created DESC',
    );
  });

  it('is case- and whitespace-insensitive about the clause', () => {
    expect(scope.constrainJql('status = Done   order   by   created')).toBe(
      'project in (PROJ) AND (status = Done) order   by   created',
    );
  });

  it('does not mistake a field whose name contains ORDER', () => {
    expect(scope.constrainJql('reorderBy = 3')).toBe('project in (PROJ) AND (reorderBy = 3)');
  });
});
