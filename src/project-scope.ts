/**
 * Optional project allowlist (JIRA_PROJECTS).
 *
 * "Restrict the MCP server to certain projects" is the most-requested unmet
 * capability across the Atlassian MCP ecosystem, and neither of the leading
 * servers implements it. It is enforced here rather than trusted to the model:
 * a request naming a project outside the list is refused before any API call.
 *
 * This constrains what the server will ask for. It cannot widen access beyond
 * what the token already permits, and it is not a substitute for Jira
 * permissions — it is a blast-radius control for agent use.
 */

const ISSUE_KEY_RE = /^([A-Za-z][A-Za-z0-9_]*)-\d+$/;
// JQL's ORDER BY must stay at the very end, so it is split off before wrapping.
// Matched on a word boundary so a query that *begins* with ORDER BY is handled,
// and taken as the LAST occurrence, so a quoted literal earlier in the query
// (summary ~ "ORDER BY") does not get mistaken for the real clause.
const ORDER_BY_RE = /\bORDER\s+BY\b/gi;

function lastOrderByIndex(jql: string): number {
  let index = -1;
  ORDER_BY_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = ORDER_BY_RE.exec(jql)) !== null) index = m.index;
  return index;
}

export class ProjectScope {
  private readonly allowed: string[] | null;

  constructor(projects?: string[] | null) {
    this.allowed =
      projects && projects.length > 0 ? projects.map((p) => p.trim().toUpperCase()) : null;
  }

  get isActive(): boolean {
    return this.allowed !== null;
  }

  get projects(): string[] {
    return this.allowed ? [...this.allowed] : [];
  }

  /** Project key for an issue key, or null if it isn't shaped like one. */
  static projectOf(issueKey: string): string | null {
    const m = ISSUE_KEY_RE.exec(issueKey.trim());
    return m ? m[1].toUpperCase() : null;
  }

  allows(projectKey: string): boolean {
    if (!this.allowed) return true;
    return this.allowed.includes(projectKey.trim().toUpperCase());
  }

  assertProject(projectKey: string): void {
    if (this.allows(projectKey)) return;
    throw new Error(
      `Project scope: "${projectKey}" is not in JIRA_PROJECTS. ` +
        `This server is restricted to: ${this.allowed!.join(', ')}.`,
    );
  }

  assertIssueKey(issueKey: string): void {
    if (!this.allowed) return;
    const project = ProjectScope.projectOf(issueKey);
    if (project === null) {
      // Numeric issue IDs carry no project, so the allowlist cannot be checked.
      throw new Error(
        `Project scope: "${issueKey}" is not a project-qualified issue key (expected PROJ-123). ` +
          'When JIRA_PROJECTS is set, issues must be addressed by key so the project can be verified.',
      );
    }
    this.assertProject(project);
  }

  /** Wrap a JQL query so it cannot reach outside the allowlist. */
  constrainJql(jql: string): string {
    if (!this.allowed) return jql;

    const trimmed = jql.trim();
    const clause = `project in (${this.allowed.join(', ')})`;
    if (trimmed === '') return clause;

    const idx = lastOrderByIndex(trimmed);
    if (idx === -1) return `${clause} AND (${trimmed})`;

    const where = trimmed.slice(0, idx).trim();
    const orderBy = trimmed.slice(idx).trim();
    return where === '' ? `${clause} ${orderBy}` : `${clause} AND (${where}) ${orderBy}`;
  }
}

export function parseProjects(raw: string | undefined): string[] | null {
  if (!raw || raw.trim() === '') return null;
  const projects = raw
    .split(',')
    .map((p) => p.trim().toUpperCase())
    .filter((p) => p !== '');
  if (projects.length === 0) return null;

  const invalid = projects.filter((p) => !/^[A-Z][A-Z0-9_]*$/.test(p));
  if (invalid.length > 0) {
    throw new Error(
      `Invalid project key(s) in JIRA_PROJECTS: ${invalid.join(', ')}. ` +
        'Use project keys such as PROJ, not names or IDs.',
    );
  }
  return projects;
}
