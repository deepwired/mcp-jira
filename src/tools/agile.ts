import { z } from 'zod';
import { JiraClient } from '../client.js';
import { JiraIssue, ToolResult } from '../types.js';

/**
 * Jira Software (agile) tools.
 *
 * Two things differ from the platform API and both cause 401s that look like
 * something else:
 *
 *  - Jira Software publishes NO classic scopes. read:jira-work cannot reach
 *    these endpoints; granular jira-software scopes are mandatory.
 *  - GET /rest/agile/1.0/board additionally needs read:project:jira.
 *
 * Issue listing uses /rest/software/1.0/, because the /rest/agile/1.0/
 * backlog, board-issue, sprint-issue and epic-issue routes are deprecated.
 */

const listBoardsSchema = z.object({
  projectKeyOrId: z.string().optional().describe('Restrict to boards for one project.'),
  name: z.string().optional().describe('Filter by board name (substring match).'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(50).default(50),
});

const listSprintsSchema = z.object({
  boardId: z.union([z.string(), z.number()]).describe('Board ID from jira_list_boards.'),
  state: z
    .enum(['active', 'future', 'closed'])
    .optional()
    .describe('Filter by sprint state. Omit for all.'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(50).default(50),
});

const sprintIssuesSchema = z.object({
  sprintId: z.union([z.string(), z.number()]).describe('Sprint ID from jira_list_sprints.'),
  jql: z.string().optional().describe('Additional JQL to narrow the sprint contents.'),
  startAt: z.number().int().min(0).default(0),
  maxResults: z.number().int().min(1).max(100).default(50),
});

/**
 * One write tool rather than three. Every action here requires exactly the same
 * scope (write:sprint:jira-software), so collapsing them costs no gating
 * granularity — which is the failure mode that forced GitHub to decompose its
 * own action-dispatched tools.
 */
const manageSprintSchema = z.object({
  action: z
    .enum(['create', 'update', 'add_issues'])
    .describe('create a sprint, update its fields, or move issues into it.'),
  boardId: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Required for action "create".'),
  sprintId: z
    .union([z.string(), z.number()])
    .optional()
    .describe('Required for "update" and "add_issues".'),
  name: z.string().optional().describe('Sprint name, for "create" or "update".'),
  goal: z.string().optional().describe('Sprint goal.'),
  startDate: z.string().optional().describe('ISO 8601 start date.'),
  endDate: z.string().optional().describe('ISO 8601 end date.'),
  state: z
    .enum(['future', 'active', 'closed'])
    .optional()
    .describe('Sprint state, for "update". Starting a sprint means setting "active".'),
  issueKeys: z.array(z.string()).optional().describe('Issue keys, for "add_issues".'),
});

interface Board {
  id: number;
  name: string;
  type: string;
  location?: { projectKey?: string; projectName?: string };
}

interface Sprint {
  id: number;
  name: string;
  state: string;
  startDate?: string;
  endDate?: string;
  goal?: string;
}

function textResult(text: string, isError = false): ToolResult {
  return { content: [{ type: 'text', text }], isError };
}

function summariseIssues(issues: JiraIssue[]): string[] {
  return issues.map((i) => {
    const status = (i.fields?.status as Record<string, unknown>)?.name ?? 'Unknown';
    const assignee =
      (i.fields?.assignee as Record<string, unknown>)?.displayName ?? 'Unassigned';
    return `- **${i.key}**: ${i.fields?.summary ?? 'No summary'} [${status}] (${assignee})`;
  });
}

export function createAgileTools(client: JiraClient) {
  return {
    jira_list_boards: {
      description:
        'List Jira Software boards (scrum and kanban), optionally filtered by project or name. ' +
        'Board IDs from here feed jira_list_sprints.',
      inputSchema: listBoardsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listBoardsSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        if (parsed.projectKeyOrId) params.set('projectKeyOrId', parsed.projectKeyOrId);
        if (parsed.name) params.set('name', parsed.name);

        const res = await client.get<{ values: Board[]; total: number; isLast: boolean }>(
          `/rest/agile/1.0/board?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const boards = res.data?.values ?? [];
        if (boards.length === 0) {
          return textResult(
            'No boards returned. If you expected some, check that the token has both ' +
              '`read:board-scope:jira-software` and `read:project:jira` — the board endpoint ' +
              'needs the project scope too, and returns 401 or an empty list without it.',
          );
        }

        const lines = boards.map((b) => {
          const proj = b.location?.projectKey ? ` — ${b.location.projectKey}` : '';
          return `- **${b.name}** (id: ${b.id}, ${b.type})${proj}`;
        });
        return textResult(`${boards.length} board(s):\n\n${lines.join('\n')}`);
      },
    },

    jira_list_sprints: {
      description:
        'List sprints on a Jira Software board, optionally filtered to active, future or closed. ' +
        'Use this to find the current sprint before querying its issues.',
      inputSchema: listSprintsSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = listSprintsSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
        });
        if (parsed.state) params.set('state', parsed.state);

        const res = await client.get<{ values: Sprint[]; isLast: boolean }>(
          `/rest/agile/1.0/board/${encodeURIComponent(String(parsed.boardId))}/sprint?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const sprints = res.data?.values ?? [];
        if (sprints.length === 0) {
          const scope = parsed.state ? ` in state "${parsed.state}"` : '';
          return textResult(`No sprints${scope} on board ${parsed.boardId}.`);
        }

        const lines = sprints.map((s) => {
          const dates =
            s.startDate && s.endDate ? ` ${s.startDate.slice(0, 10)} → ${s.endDate.slice(0, 10)}` : '';
          const goal = s.goal ? `\n  Goal: ${s.goal}` : '';
          return `- **${s.name}** (id: ${s.id}, ${s.state})${dates}${goal}`;
        });
        return textResult(
          `${sprints.length} sprint(s) on board ${parsed.boardId}:\n\n${lines.join('\n')}`,
        );
      },
    },

    jira_get_sprint_issues: {
      description:
        'List the issues in a sprint, with status and assignee. Optionally narrow with extra JQL, ' +
        'e.g. "status != Done" to see what is still open.',
      inputSchema: sprintIssuesSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = sprintIssuesSchema.parse(args);
        const params = new URLSearchParams({
          startAt: String(parsed.startAt),
          maxResults: String(parsed.maxResults),
          fields: 'summary,status,assignee,issuetype,priority',
        });
        if (parsed.jql) params.set('jql', parsed.jql);

        // /rest/software/1.0/ — the /rest/agile/1.0/ equivalent is deprecated.
        const res = await client.get<{ issues: JiraIssue[]; total: number }>(
          `/rest/software/1.0/sprint/${encodeURIComponent(String(parsed.sprintId))}/issue?${params.toString()}`,
        );
        if (!res.ok) return textResult(res.error!, true);

        const issues = res.data?.issues ?? [];
        if (issues.length === 0) {
          return textResult(`No issues in sprint ${parsed.sprintId}.`);
        }
        return textResult(
          `${res.data?.total ?? issues.length} issue(s) in sprint ${parsed.sprintId}:\n\n${summariseIssues(issues).join('\n')}`,
        );
      },
    },

    jira_manage_sprint: {
      description:
        'Create a sprint, update an existing one (including starting or closing it via state), ' +
        'or move issues into it. Requires write:sprint:jira-software.',
      inputSchema: manageSprintSchema,
      handler: async (args: Record<string, unknown>): Promise<ToolResult> => {
        const parsed = manageSprintSchema.parse(args);

        if (parsed.action === 'create') {
          if (!parsed.boardId) return textResult('boardId is required to create a sprint.', true);
          if (!parsed.name) return textResult('name is required to create a sprint.', true);
          const body: Record<string, unknown> = {
            originBoardId: Number(parsed.boardId),
            name: parsed.name,
          };
          if (parsed.goal) body.goal = parsed.goal;
          if (parsed.startDate) body.startDate = parsed.startDate;
          if (parsed.endDate) body.endDate = parsed.endDate;

          const res = await client.post<Sprint>('/rest/agile/1.0/sprint', body);
          if (!res.ok) return textResult(res.error!, true);
          return textResult(
            `Sprint "${parsed.name}" created on board ${parsed.boardId} (id: ${res.data?.id ?? 'unknown'}).`,
          );
        }

        if (parsed.action === 'update') {
          if (!parsed.sprintId) return textResult('sprintId is required to update a sprint.', true);
          const body: Record<string, unknown> = {};
          if (parsed.name !== undefined) body.name = parsed.name;
          if (parsed.goal !== undefined) body.goal = parsed.goal;
          if (parsed.startDate !== undefined) body.startDate = parsed.startDate;
          if (parsed.endDate !== undefined) body.endDate = parsed.endDate;
          if (parsed.state !== undefined) body.state = parsed.state;

          if (Object.keys(body).length === 0) {
            return textResult('No changes supplied — provide name, goal, dates or state.', true);
          }

          const res = await client.post(
            `/rest/agile/1.0/sprint/${encodeURIComponent(String(parsed.sprintId))}`,
            body,
          );
          if (!res.ok) return textResult(res.error!, true);
          return textResult(`Sprint ${parsed.sprintId} updated.`);
        }

        // add_issues
        if (!parsed.sprintId) return textResult('sprintId is required to add issues.', true);
        if (!parsed.issueKeys || parsed.issueKeys.length === 0) {
          return textResult('issueKeys is required and must be non-empty.', true);
        }
        const res = await client.post(
          `/rest/agile/1.0/sprint/${encodeURIComponent(String(parsed.sprintId))}/issue`,
          { issues: parsed.issueKeys },
        );
        if (!res.ok) return textResult(res.error!, true);
        return textResult(
          `Moved ${parsed.issueKeys.length} issue(s) into sprint ${parsed.sprintId}: ${parsed.issueKeys.join(', ')}.`,
        );
      },
    },
  };
}
